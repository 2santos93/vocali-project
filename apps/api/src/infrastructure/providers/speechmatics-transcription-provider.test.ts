import { MockAgent } from 'undici';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import {
  SpeechmaticsTranscriptionProvider,
  type SpeechmaticsProviderOptions,
} from './speechmatics-transcription-provider.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';

const BATCH_ORIGIN = 'https://eu1.asr.api.speechmatics.com';
const MANAGEMENT_ORIGIN = 'https://mp.speechmatics.com';
const JOBS_PATH = '/v2/jobs/';
const KEYS_PATH = '/v1/api_keys';

const API_KEY_PARAMETER = '/vocali/speechmatics/api-key';
const WEBHOOK_SECRET_PARAMETER = '/vocali/speechmatics/webhook-secret';

/**
 * Written to look like the real thing rather than like a placeholder: the
 * point of the "never logged" test is that a value of this shape cannot be
 * found anywhere in the captured output, and `'secret'` would match half the
 * words a log line contains.
 */
const API_KEY = 'JnT4pKq7XwZ2bR9mLd6VsYh1Gc3FaE8u';
const WEBHOOK_SECRET = 'whs_9QbR2tYm7KpL4vXn6ZdA1sHf';

const NOW = new Date('2026-08-11T09:00:00.000Z');
const AUDIO_URL =
  'https://vocali-audio.s3.eu-west-1.amazonaws.com/audio/user-1/01A/visita.mp3?sig=x';
const CALLBACK_URL =
  'https://api.vocali.test/webhooks/transcription-provider?transcriptionId=01A&userId=user-1';

const OPTIONS: SpeechmaticsProviderOptions = {
  apiKeySecretName: API_KEY_PARAMETER,
  webhookSecretName: WEBHOOK_SECRET_PARAMETER,
  requestTimeoutMs: 60,
  maxAttempts: 3,
  retryBaseDelayMs: 100,
  maxRetryDelayMs: 10_000,
};

interface CapturedRequest {
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

interface StubResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly delayMs?: number;
}

class StubSecretsProvider implements SecretsProvider {
  readonly requested: string[] = [];

  private readonly values: Record<string, string> = {
    [API_KEY_PARAMETER]: API_KEY,
    [WEBHOOK_SECRET_PARAMETER]: WEBHOOK_SECRET,
  };

  getSecret(name: string): Promise<string> {
    this.requested.push(name);
    const value = this.values[name];

    return value === undefined
      ? Promise.reject(new Error(`no stub secret for ${name}`))
      : Promise.resolve(value);
  }
}

let agent: MockAgent;
let requests: CapturedRequest[];

/**
 * Every test builds its own agent with outbound connections disabled, so a
 * request this suite forgot to intercept fails loudly instead of reaching
 * Speechmatics and spending the free tier's 480 minutes.
 *
 * The agent is handed to each request individually rather than installed with
 * `setGlobalDispatcher`. Jest runs this file in its own VM realm, so the
 * global that call writes to is not the global the `fetch` Node injected into
 * the sandbox reads from: the mock appears to be installed, every request
 * leaves the machine anyway, and the failures that follow point everywhere
 * except at the cause.
 */
beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  requests = [];
});

afterEach(async () => {
  await agent.close();
});

function intercept(
  origin: string,
  path: string,
  query: Record<string, string> | undefined,
  ...responses: StubResponse[]
): void {
  for (const response of responses) {
    const scope = agent
      .get(origin)
      .intercept({ path, method: 'POST', ...(query === undefined ? {} : { query }) })
      .reply((options) => {
        requests.push({ headers: normaliseHeaders(options.headers), body: options.body });

        return {
          statusCode: response.status,
          data: response.body ?? {},
          responseOptions: { headers: response.headers ?? {} },
        };
      });

    if (response.delayMs !== undefined) scope.delay(response.delayMs);
  }
}

function interceptJobs(...responses: StubResponse[]): void {
  intercept(BATCH_ORIGIN, JOBS_PATH, undefined, ...responses);
}

function interceptTemporaryKeys(...responses: StubResponse[]): void {
  intercept(MANAGEMENT_ORIGIN, KEYS_PATH, { type: 'rt' }, ...responses);
}

/**
 * `fetch` takes an undici dispatcher per request, which is how the mock is
 * reached without touching a global. The assertion is unavoidable and says
 * nothing about the runtime: the global `RequestInit` declares `dispatcher`
 * against the `undici-types` bundled with `@types/node`, the agent comes from
 * the `undici` dev dependency at the same version, and the two declarations
 * are structurally identical except that `Dispatcher.compose` is recursively
 * self-typed, which is where the comparison gives up.
 *
 * The body deliberately stays a global `FormData`, exactly as production
 * builds it. Handing undici's own `fetch` the global class instead — the
 * other way to reach the mock — fails an `instanceof` check inside it and
 * silently posts the form as `text/plain`.
 */
function dispatchedThroughMock(init: RequestInit): RequestInit {
  return { ...init, dispatcher: agent } as unknown as RequestInit;
}

function normaliseHeaders(headers: unknown): Record<string, string> {
  if (typeof headers !== 'object' || headers === null) return {};

  return Object.fromEntries(
    Object.entries(headers as Record<string, unknown>).map(([name, value]) => [
      name.toLowerCase(),
      String(value),
    ]),
  );
}

function buildProvider(overrides: Partial<SpeechmaticsProviderOptions> = {}): {
  provider: SpeechmaticsTranscriptionProvider;
  logger: CapturingLogger;
  secrets: StubSecretsProvider;
  delays: number[];
} {
  const logger = new CapturingLogger();
  const secrets = new StubSecretsProvider();
  const delays: number[] = [];

  const provider = new SpeechmaticsTranscriptionProvider(
    secrets,
    new FixedClock(NOW),
    logger,
    { ...OPTIONS, ...overrides },
    {
      fetch: (url, init): Promise<Response> => fetch(url, dispatchedThroughMock(init)),
      // The backoff is observed rather than waited on, and the jitter is
      // pinned, so the delay a test asserts is the delay the code computed.
      sleep: (milliseconds): Promise<void> => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
      random: (): number => 1,
    },
  );

  return { provider, logger, secrets, delays };
}

function submittedConfig(request: CapturedRequest): Record<string, unknown> {
  const body = request.body;
  if (!(body instanceof FormData))
    throw new Error('the job was not submitted as multipart form data');

  const config = body.get('config');
  if (typeof config !== 'string') throw new Error('the multipart body carried no config field');

  return JSON.parse(config) as Record<string, unknown>;
}

function firstRequest(): CapturedRequest {
  const request = requests[0];
  if (request === undefined) throw new Error('no request reached the provider');

  return request;
}

async function expectProviderError(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (caught) {
    return caught as Error;
  }

  throw new Error('the operation resolved instead of failing');
}

describe('SpeechmaticsTranscriptionProvider', () => {
  describe('submitFileJob', () => {
    it('submits the job configuration and returns the provider job id', async () => {
      interceptJobs({ status: 201, body: { id: 'sm-job-42' } });
      const { provider, secrets } = buildProvider();

      const job = await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        language: 'es',
        callbackUrl: CALLBACK_URL,
      });

      expect(job).toEqual({ externalJobId: 'sm-job-42' });

      const request = firstRequest();
      expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(request.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(secrets.requested).toEqual([API_KEY_PARAMETER, WEBHOOK_SECRET_PARAMETER]);

      expect(submittedConfig(request)).toEqual({
        type: 'transcription',
        fetch_data: { url: AUDIO_URL },
        transcription_config: { language: 'es', operating_point: 'enhanced' },
        notification_config: [
          {
            url: CALLBACK_URL,
            contents: ['transcript'],
            auth_headers: [`Authorization: Bearer ${WEBHOOK_SECRET}`],
          },
        ],
      });
    });

    it('hands over a url instead of the audio, so the file never enters this process', async () => {
      interceptJobs({ status: 201, body: { id: 'sm-job-42' } });
      const { provider } = buildProvider();

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        language: 'es',
        callbackUrl: CALLBACK_URL,
      });

      const body = firstRequest().body;
      if (!(body instanceof FormData))
        throw new Error('the job was not submitted as multipart form data');

      // `data_file` is the field that would carry the bytes. The whole request
      // is one small JSON string, and a 20 MB file read into a Lambda to be
      // forwarded would show up here as a second field — so its absence is
      // what this asserts, not merely that `fetch_data` is present.
      expect([...body.keys()]).toEqual(['config']);
      expect(body.get('data_file')).toBeNull();
    });

    it('does not retry a request the provider rejected', async () => {
      interceptJobs({ status: 400, body: { error: 'Invalid fetch_data url' } });
      const { provider, delays } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, language: 'es', callbackUrl: CALLBACK_URL }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      // One attempt, no backoff. A payload the provider has already refused
      // will be refused identically next time; retrying it only spends quota.
      expect(requests).toHaveLength(1);
      expect(delays).toEqual([]);
    });

    it('keeps the provider status out of the error the caller receives', async () => {
      interceptJobs({ status: 403, body: { error: 'Forbidden' } });
      const { provider } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, language: 'es', callbackUrl: CALLBACK_URL }),
      );

      expect(error.message).not.toMatch(/403|Forbidden/);
      expect(error.message).toBe(
        'The transcription provider could not complete the request: submitFileJob was rejected by the provider',
      );
    });

    it('retries a server fault and returns the job from the later attempt', async () => {
      interceptJobs({ status: 503 }, { status: 201, body: { id: 'sm-job-77' } });
      const { provider, delays } = buildProvider();

      const job = await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        language: 'es',
        callbackUrl: CALLBACK_URL,
      });

      expect(job.externalJobId).toBe('sm-job-77');
      expect(requests).toHaveLength(2);
      // Equal jitter with `random` pinned to 1: half the exponential term is
      // fixed, half is the pinned draw, so the first delay is the base delay.
      expect(delays).toEqual([100]);
    });

    it('waits the number of seconds a 429 asked for', async () => {
      interceptJobs(
        { status: 429, headers: { 'retry-after': '3' } },
        { status: 201, body: { id: 'sm-job-78' } },
      );
      const { provider, delays } = buildProvider();

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        language: 'es',
        callbackUrl: CALLBACK_URL,
      });

      // 3000, not the 100 ms the backoff would have chosen. The provider knows
      // when its quota window rolls over and this adapter does not, so its
      // instruction outranks the local schedule.
      expect(delays).toEqual([3_000]);
    });

    it('waits until the instant a dated Retry-After names', async () => {
      interceptJobs(
        { status: 429, headers: { 'retry-after': 'Tue, 11 Aug 2026 09:00:07 GMT' } },
        { status: 201, body: { id: 'sm-job-79' } },
      );
      const { provider, delays } = buildProvider();

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        language: 'es',
        callbackUrl: CALLBACK_URL,
      });

      // Resolved against the injected clock, seven seconds after `NOW`.
      expect(delays).toEqual([7_000]);
    });

    it('gives up after the configured number of attempts', async () => {
      interceptJobs({ status: 500 }, { status: 500 }, { status: 500 });
      const { provider, delays } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, language: 'es', callbackUrl: CALLBACK_URL }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(requests).toHaveLength(3);
      // Two waits for three attempts: nothing sleeps after the last one.
      expect(delays).toEqual([100, 200]);
    });

    it('abandons a request that outlives the configured timeout', async () => {
      interceptJobs({ status: 201, body: { id: 'sm-job-80' }, delayMs: 400 });
      const { provider, logger } = buildProvider({ maxAttempts: 1, requestTimeoutMs: 40 });

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, language: 'es', callbackUrl: CALLBACK_URL }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      // A hung provider must not hold the Lambda open until the function's own
      // timeout, so the failure has to be the adapter's, and it has to be fast.
      expect(logger.serialise()).toContain('the request timed out');
    });

    it('rejects a success response that carries no job id', async () => {
      interceptJobs({ status: 201, body: { status: 'running' } });
      const { provider } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, language: 'es', callbackUrl: CALLBACK_URL }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(error.message).toContain('returned no job id');
    });

    it('never writes the api key or the webhook secret into a log line', async () => {
      interceptJobs({ status: 503 }, { status: 400, body: { error: 'Invalid config' } });
      const { provider, logger } = buildProvider();

      await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, language: 'es', callbackUrl: CALLBACK_URL }),
      );

      // Both a retry line and a rejection line were written, so there is real
      // output to search rather than an empty log trivially satisfying this.
      expect(logger.entries.length).toBeGreaterThanOrEqual(2);

      const written = logger.serialise();
      expect(written).not.toContain(API_KEY);
      expect(written).not.toContain(WEBHOOK_SECRET);
      // CloudWatch retains what is written to it, and log read access is far
      // broader than secret read access. A key that reaches a log line is a
      // key that has to be rotated.
      expect(written).not.toContain('Bearer');
    });
  });

  describe('createRealtimeCredentials', () => {
    it('mints a temporary key and reports where and how long it can be used', async () => {
      interceptTemporaryKeys({
        status: 201,
        body: { apikey_id: 'key-1', key_value: 'temporary-jwt-value' },
      });
      const { provider, secrets } = buildProvider();

      const credentials = await provider.createRealtimeCredentials({ ttlSeconds: 60 });

      expect(credentials).toEqual({
        token: 'temporary-jwt-value',
        websocketUrl: 'wss://eu.rt.speechmatics.com/v2',
        expiresAt: new Date('2026-08-11T09:01:00.000Z'),
      });
      // The token is returned beside the url and never inside it: a credential
      // in a query string is a credential in every log that records urls.
      expect(credentials.websocketUrl).not.toContain('temporary-jwt-value');

      const request = firstRequest();
      expect(request.headers.authorization).toBe(`Bearer ${API_KEY}`);
      expect(request.headers['content-type']).toBe('application/json');
      expect(request.body).toBe(JSON.stringify({ ttl: 60 }));
      // The webhook secret has no part in a realtime session, so it is not read.
      expect(secrets.requested).toEqual([API_KEY_PARAMETER]);
    });

    it('raises a ttl below the provider minimum instead of spending a rejected request', async () => {
      interceptTemporaryKeys({ status: 201, body: { key_value: 'temporary-jwt-value' } });
      const { provider, logger } = buildProvider();

      const credentials = await provider.createRealtimeCredentials({ ttlSeconds: 5 });

      expect(firstRequest().body).toBe(JSON.stringify({ ttl: 60 }));
      expect(credentials.expiresAt).toEqual(new Date('2026-08-11T09:01:00.000Z'));
      expect(logger.serialise()).toContain('Clamped the realtime key lifetime');
    });

    it('translates a rejected key request into a domain error', async () => {
      interceptTemporaryKeys({ status: 401, body: { error: 'Unauthorized' } });
      const { provider, delays } = buildProvider();

      const error = await expectProviderError(
        provider.createRealtimeCredentials({ ttlSeconds: 60 }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(error.message).not.toMatch(/401|Unauthorized/);
      expect(delays).toEqual([]);
    });

    it('rejects a response that carries no key', async () => {
      interceptTemporaryKeys({ status: 201, body: { apikey_id: 'key-1' } });
      const { provider } = buildProvider();

      const error = await expectProviderError(
        provider.createRealtimeCredentials({ ttlSeconds: 60 }),
      );

      expect(error.message).toContain('returned no key');
    });
  });
});
