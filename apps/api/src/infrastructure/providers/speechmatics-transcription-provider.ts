import {
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
} from '@vocali/contracts/constants';
import { TranscriptionProviderError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';
import type {
  ProviderCallback,
  ProviderJobOutcome,
  RealtimeCredentials,
  SubmittedJob,
} from '../../domain/types/provider.js';
import {
  AUTOMATIC_LANGUAGE,
  BATCH_JOBS_URL,
  LANGUAGE_IDENTIFICATION_LOW_CONFIDENCE_ACTION,
  MAX_REALTIME_KEY_TTL_SECONDS,
  MIN_REALTIME_KEY_TTL_SECONDS,
  OPERATING_POINT,
  REALTIME_WEBSOCKET_URL,
  TEMPORARY_KEY_URL,
} from './speechmatics-api-constants.js';
import {
  backoffDelayMs,
  isRetryableStatus,
  JOB_SUBMISSION_RETRY_POLICY,
  parseRetryAfterMs,
  REPEATABLE_OPERATION_RETRY_POLICY,
} from './retry-policy.js';
import { interpretSpeechmaticsCallback } from './speechmatics-callback.js';
import type { AttemptResult, RequestInitWithHeaders, RetryPolicy } from '../types/http-retry.js';
import type { SpeechmaticsProviderOptions } from '../types/config.js';
import type { SpeechmaticsRuntimeHooks } from '../types/speechmatics.js';

export class SpeechmaticsTranscriptionProvider implements TranscriptionProvider {
  private readonly fetch: SpeechmaticsRuntimeHooks['fetch'];
  private readonly sleep: SpeechmaticsRuntimeHooks['sleep'];
  private readonly random: SpeechmaticsRuntimeHooks['random'];

  constructor(
    private readonly secrets: SecretsProvider,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly options: SpeechmaticsProviderOptions,
    hooks: Partial<SpeechmaticsRuntimeHooks> = {},
  ) {
    this.fetch = hooks.fetch ?? ((url, init): Promise<Response> => fetch(url, init));
    this.sleep = hooks.sleep ?? defaultSleep;
    this.random = hooks.random ?? Math.random;
  }

  async submitFileJob(input: { audioUrl: string; callbackUrl: string }): Promise<SubmittedJob> {
    const [apiKey, webhookSecret] = await Promise.all([
      this.secrets.getSecret(this.options.apiKeySecretName),
      this.secrets.getSecret(this.options.webhookSecretName),
    ]);

    const body = new FormData();
    body.append(
      'config',
      JSON.stringify({
        type: 'transcription',
        fetch_data: { url: input.audioUrl },
        transcription_config: { language: AUTOMATIC_LANGUAGE, operating_point: OPERATING_POINT },
        language_identification_config: {
          expected_languages: SUPPORTED_TRANSCRIPTION_LANGUAGES,
          low_confidence_action: LANGUAGE_IDENTIFICATION_LOW_CONFIDENCE_ACTION,
          default_language: DEFAULT_TRANSCRIPTION_LANGUAGE,
        },
        notification_config: [
          {
            url: input.callbackUrl,
            contents: ['transcript'],
            auth_headers: [`Authorization: Bearer ${webhookSecret}`],
          },
        ],
      }),
    );

    const response = await this.send(
      'submitFileJob',
      BATCH_JOBS_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body,
      },
      JOB_SUBMISSION_RETRY_POLICY,
    );

    const payload = await readJsonObject(response, 'the job submission');
    const externalJobId = payload.id;
    if (typeof externalJobId !== 'string' || externalJobId === '') {
      throw new TranscriptionProviderError('the job submission returned no job id');
    }

    return { externalJobId };
  }

  async createRealtimeCredentials(input: { ttlSeconds: number }): Promise<RealtimeCredentials> {
    const apiKey = await this.secrets.getSecret(this.options.apiKeySecretName);
    const ttlSeconds = this.resolveKeyTtlSeconds(input.ttlSeconds);

    const response = await this.send(
      'createRealtimeCredentials',
      TEMPORARY_KEY_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: ttlSeconds }),
      },
      REPEATABLE_OPERATION_RETRY_POLICY,
    );

    const payload = await readJsonObject(response, 'the temporary key request');
    const token = payload.key_value;
    if (typeof token !== 'string' || token === '') {
      throw new TranscriptionProviderError('the temporary key request returned no key');
    }

    return {
      token,
      websocketUrl: REALTIME_WEBSOCKET_URL,
      expiresAt: new Date(this.clock.now().getTime() + ttlSeconds * 1_000),
    };
  }

  interpretCallback(callback: ProviderCallback): Promise<ProviderJobOutcome> {
    return Promise.resolve(interpretSpeechmaticsCallback(callback));
  }

  private resolveKeyTtlSeconds(requested: number): number {
    const applied = Math.min(
      Math.max(Math.trunc(requested), MIN_REALTIME_KEY_TTL_SECONDS),
      MAX_REALTIME_KEY_TTL_SECONDS,
    );

    if (applied !== requested) {
      this.logger.info('Clamped the realtime key lifetime to the range the provider accepts', {
        requestedTtlSeconds: requested,
        appliedTtlSeconds: applied,
      });
    }

    return applied;
  }

  private async send(
    operation: string,
    url: string,
    init: RequestInitWithHeaders,
    retry: RetryPolicy,
  ): Promise<Response> {
    let lastReason = 'the request never completed';

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt += 1) {
      const result = await this.attempt(url, init, retry);

      if (result.kind === 'success') return result.response;

      if (result.kind === 'permanent') {
        this.logger.error('Transcription provider request failed and was not retried', {
          operation,
          attempt,
          reason: result.reason,
          status: result.status,
        });
        throw new TranscriptionProviderError(
          result.status === null
            ? `${operation} could not be completed`
            : `${operation} was rejected by the provider`,
        );
      }

      lastReason = result.reason;
      this.logger.warn('Transcription provider request failed and will be retried', {
        operation,
        attempt,
        reason: result.reason,
        status: result.status,
      });

      if (attempt < this.options.maxAttempts) {
        await this.sleep(
          backoffDelayMs(
            {
              baseDelayMs: this.options.retryBaseDelayMs,
              maxDelayMs: this.options.maxRetryDelayMs,
              random: this.random,
            },
            attempt,
            result.retryAfterMs,
          ),
        );
      }
    }

    this.logger.error('Transcription provider request exhausted its attempts', {
      operation,
      attempts: this.options.maxAttempts,
      reason: lastReason,
    });
    throw new TranscriptionProviderError(
      `${operation} did not succeed after ${String(this.options.maxAttempts)} attempts`,
    );
  }

  private async attempt(
    url: string,
    init: RequestInitWithHeaders,
    retry: RetryPolicy,
  ): Promise<AttemptResult> {
    let response: Response;

    try {
      response = await this.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.options.requestTimeoutMs),
      });
    } catch (cause) {
      const reason = describeRequestFailure(cause);

      return retry.onUnansweredRequest
        ? { kind: 'transient', reason, status: null, retryAfterMs: null }
        : { kind: 'permanent', reason, status: null };
    }

    if (response.ok) return { kind: 'success', response };

    const status = response.status;
    const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'), this.clock.now());

    // Nothing reads the body of a failed response, and an undrained body keeps
    // its socket checked out of the pool for the rest of the container's life.
    await discardBody(response);

    if (isRetryableStatus(status, retry)) {
      return {
        kind: 'transient',
        reason: 'the provider returned a retryable status',
        status,
        retryAfterMs,
      };
    }

    return { kind: 'permanent', reason: 'the provider returned an error status', status };
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function describeRequestFailure(cause: unknown): string {
  const code: unknown = (cause as { code?: unknown } | null)?.code;

  return code === 'TimeoutError' || code === 23 || code === 'ABORT_ERR'
    ? 'the request timed out'
    : 'the request could not be completed';
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A body that cannot be cancelled is already gone, and this must not mask
    // the failure being reported.
  }
}

async function readJsonObject(
  response: Response,
  description: string,
): Promise<Record<string, unknown>> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new TranscriptionProviderError(`${description} returned a body that is not valid JSON`);
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new TranscriptionProviderError(`${description} returned an unexpected body`);
  }

  return payload as Record<string, unknown>;
}
