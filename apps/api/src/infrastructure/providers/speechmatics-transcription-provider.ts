import { TranscriptionProviderError } from '../../domain/errors/domain-error.js';
import type { Clock } from '../../domain/ports/clock.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import type {
  RealtimeCredentials,
  SubmittedJob,
  TranscriptionProvider,
} from '../../domain/ports/transcription-provider.js';

/**
 * The EU regional hosts, chosen to match the `eu-west-1` deployment: clinical
 * audio stays in the same jurisdiction as the rest of the platform, and the
 * round trip is shorter than to the global endpoint.
 */
const BATCH_JOBS_URL = 'https://eu1.asr.api.speechmatics.com/v2/jobs/';
const TEMPORARY_KEY_URL = 'https://mp.speechmatics.com/v1/api_keys?type=rt';
const REALTIME_WEBSOCKET_URL = 'wss://eu.rt.speechmatics.com/v2';

/** Higher accuracy at the cost of latency, which a batch job can afford. */
const OPERATING_POINT = 'enhanced';

/** The provider rejects a temporary key request outside this range. */
const MIN_REALTIME_KEY_TTL_SECONDS = 60;
const MAX_REALTIME_KEY_TTL_SECONDS = 86_400;

/**
 * The two statuses that say the request was not accepted: the provider gave up
 * waiting for it (408), or the quota window has not rolled over yet (429).
 * Because neither can have been acted on, both are safe to send again whatever
 * the operation does. Everything else in the 4xx range describes the request
 * itself, and a request the provider has already rejected will be rejected
 * identically the second time — retrying it only spends quota and holds a
 * Lambda open.
 */
const REQUEST_NOT_ACCEPTED_STATUS_CODES = new Set([408, 429]);

/**
 * What to do with the two outcomes where the request may or may not have been
 * acted on: one that produced no response at all, and a 5xx, which can be an
 * edge proxy answering for a server that already did the work.
 *
 * Retryability belongs to the operation rather than to the status, so it is
 * declared beside each call instead of being a global rule to remember.
 */
interface RetryPolicy {
  readonly onUnansweredRequest: boolean;
  readonly onServerFault: boolean;
}

/**
 * For an operation that can be performed twice without a second effect.
 * Minting a temporary key again costs one unused key that expires within the
 * minute, so an unknown outcome is worth another attempt.
 */
const REPEATABLE_OPERATION_RETRY_POLICY: RetryPolicy = {
  onUnansweredRequest: true,
  onServerFault: true,
};

/**
 * `POST /v2/jobs/` creates a resource and Speechmatics documents no
 * idempotency key, so a second attempt cannot be recognised as the same
 * submission. A first attempt that reached the provider and then timed out —
 * or that an edge proxy answered 5xx after the job had been created — would
 * leave two jobs transcribing the same audio against the same callback URL:
 * the account's minutes spent twice, and a callback carrying a job id that
 * does not match the stored one, which the webhook can only answer 404 to.
 *
 * So an unknown outcome is treated as a submitted job and reported as a
 * failure, which the caller can act on, rather than retried blindly.
 */
const JOB_SUBMISSION_RETRY_POLICY: RetryPolicy = {
  onUnansweredRequest: false,
  onServerFault: false,
};

export interface SpeechmaticsProviderOptions {
  /** SSM parameter holding the long-lived provider key. */
  readonly apiKeySecretName: string;
  /** SSM parameter holding the secret the provider echoes back on the callback. */
  readonly webhookSecretName: string;
  readonly requestTimeoutMs: number;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly maxRetryDelayMs: number;
}

/**
 * Everything ambient this adapter touches, in one place so a test can replace
 * it. Production takes the defaults.
 *
 * `fetch` is injected rather than reached for as a global because the suite
 * intercepts HTTP with undici's `MockAgent`, and Jest runs each file in its
 * own VM realm: a dispatcher installed inside that realm is invisible to the
 * `fetch` Node injected from the outer one, so requests would quietly leave
 * the machine. Passing the implementation in makes "no test touches the
 * network" a property of the wiring rather than of a global side effect.
 */
export interface SpeechmaticsRuntimeHooks {
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}

type RequestInitWithHeaders = RequestInit & { headers: Record<string, string> };

type AttemptResult =
  | { readonly kind: 'success'; readonly response: Response }
  | { readonly kind: 'permanent'; readonly reason: string; readonly status: number | null }
  | {
      readonly kind: 'transient';
      readonly reason: string;
      readonly status: number | null;
      readonly retryAfterMs: number | null;
    };

/**
 * Speechmatics behind the `TranscriptionProvider` port.
 *
 * Two properties shape everything below. The audio is never read into this
 * process: the job carries a presigned S3 URL in `fetch_data` and the provider
 * downloads the file itself, so a 20 MB upload never becomes 20 MB of Lambda
 * memory and a second copy over the wire. And the API key is fetched through
 * the secrets port for each operation, used to build one `Authorization`
 * header, and never placed in a log context — a key in CloudWatch is a key
 * disclosed to everyone who can read logs.
 */
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

  /**
   * `fetch_data` rather than `data_file`: the provider is handed a presigned
   * GET URL and fetches the audio itself. Sending the bytes would mean loading
   * the whole file into the Lambda first, which is slower, bounded by the
   * function's memory, and buys nothing.
   *
   * The callback is authenticated with a header carried in `auth_headers`
   * rather than a signature in the query string, so the shared secret never
   * lands in an access log or a proxy's URL history.
   */
  async submitFileJob(input: {
    audioUrl: string;
    language: string;
    callbackUrl: string;
  }): Promise<SubmittedJob> {
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
        transcription_config: { language: input.language, operating_point: OPERATING_POINT },
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
        // No `Content-Type`: `fetch` derives the multipart type and its
        // boundary from the `FormData` body, and a hand-written header would
        // omit the boundary and make the body unparseable.
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

  /**
   * Mints a short-lived key for the browser. The long-lived key never leaves
   * the backend; what the browser receives expires within the minute, so a
   * token captured from a page is worth almost nothing.
   */
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
      // The socket URL is returned without the `jwt` query parameter, and the
      // caller appends the token when it opens the connection. Putting the
      // credential in a URL duplicates it into anything that records URLs.
      websocketUrl: REALTIME_WEBSOCKET_URL,
      expiresAt: new Date(this.clock.now().getTime() + ttlSeconds * 1_000),
    };
  }

  /**
   * The provider answers a TTL outside its documented range with a 400, which
   * is exactly the status this adapter refuses to retry — so a caller's bad
   * value would cost a round trip and fail the request outright. Clamping
   * turns that into a working session, and the adjustment is logged so it is
   * visible rather than silent.
   */
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
        // At `error`, because for a submission this line is the only record
        // that a clinical transcription will never happen, and an operator who
        // raises `LOG_LEVEL` to cut noise must not lose it.
        //
        // The status is logged, never carried into the thrown error: it is
        // operational detail for whoever reads CloudWatch, not something a
        // client should see or branch on.
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
        await this.sleep(this.backoffDelayMs(attempt, result.retryAfterMs));
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
        // A fresh signal per attempt, and never absent: without it a provider
        // that accepts the connection and then says nothing holds this Lambda
        // open until the function's own timeout, which is far longer and
        // costs the caller a hung request rather than a fast failure.
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

    if (REQUEST_NOT_ACCEPTED_STATUS_CODES.has(status) || (retry.onServerFault && status >= 500)) {
      return {
        kind: 'transient',
        reason: 'the provider returned a retryable status',
        status,
        retryAfterMs,
      };
    }

    return { kind: 'permanent', reason: 'the provider returned an error status', status };
  }

  /**
   * Equal jitter: half the delay is the exponential term, half is random.
   * Full jitter can return almost zero and stampede the provider again
   * immediately; no jitter puts every concurrent Lambda back on the wire in
   * the same millisecond. `Retry-After` wins outright when the provider sent
   * one — it knows when its quota window rolls over and this adapter does not.
   */
  private backoffDelayMs(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null) return Math.min(retryAfterMs, this.options.maxRetryDelayMs);

    const exponential = this.options.retryBaseDelayMs * 2 ** (attempt - 1);
    const capped = Math.min(exponential, this.options.maxRetryDelayMs);

    return Math.round(capped / 2 + (capped / 2) * this.random());
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Describes why a request never produced a response, without repeating the
 * cause's message: a fetch failure message can contain the full URL, and for
 * the batch job that URL is the presigned link to a patient's audio.
 */
function describeRequestFailure(cause: unknown): string {
  // Branching on `code`, never on `name` or `instanceof`: esbuild mangles
  // class names, and `AbortSignal.timeout` rejects with a `DOMException`
  // this bundle does not own the constructor of.
  const code: unknown = (cause as { code?: unknown } | null)?.code;

  return code === 'TimeoutError' || code === 23 || code === 'ABORT_ERR'
    ? 'the request timed out'
    : 'the request could not be completed';
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A body that cannot be cancelled is already gone; the request being
    // reported has failed either way and this must not mask its reason.
  }
}

/**
 * `Retry-After` is either a whole number of seconds or an HTTP date. The date
 * form is resolved against the injected clock so the wait is deterministic
 * under test, and a value in the past becomes zero rather than a negative
 * delay that would skip the backoff entirely.
 */
function parseRetryAfterMs(header: string | null, now: Date): number | null {
  if (header === null) return null;

  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) return null;

  return Math.max(0, retryAt - now.getTime());
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
