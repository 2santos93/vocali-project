import { MockAgent } from 'undici';
import type { SecretsProvider } from '../../../domain/ports/secrets-provider.js';
import { SpeechmaticsTranscriptionProvider } from '../speechmatics-transcription-provider.js';
import type { SpeechmaticsProviderOptions } from '../../types/speechmatics-provider-options.js';
import type { SpeechmaticsRuntimeHooks } from '../../types/speechmatics-runtime-hooks.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';

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
 * Outbound connections are disabled, so a request this suite forgot to
 * intercept fails loudly instead of reaching Speechmatics and spending the
 * free tier's 480 minutes.
 *
 * Handed to each request rather than installed with `setGlobalDispatcher`:
 * Jest runs this file in its own VM realm, so the global that call writes to
 * is not the one the injected `fetch` reads from. The mock appears installed,
 * every request leaves the machine anyway, and the failures point elsewhere.
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
 * The cast is unavoidable and says nothing about the runtime: `RequestInit`
 * declares `dispatcher` against the `undici-types` bundled with `@types/node`
 * while the agent comes from the `undici` dev dependency, and the two are
 * identical except that `Dispatcher.compose` is recursively self-typed.
 *
 * The body deliberately stays a global `FormData`, exactly as production
 * builds it. Handing undici's own `fetch` the global class instead fails an
 * `instanceof` check inside it and silently posts the form as `text/plain`.
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

function buildProvider(
  overrides: Partial<SpeechmaticsProviderOptions> = {},
  hooks: Partial<SpeechmaticsRuntimeHooks> = {},
): {
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
      ...hooks,
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

/**
 * Counts outbound attempts, including one that never produced a response.
 * `requests` cannot see those: it is filled by the mock's reply callback, so
 * an attempt answered with a transport error leaves no trace in it — and "the
 * submission went out exactly once" is precisely what those tests assert.
 */
function countingFetch(counter: { sent: number }): SpeechmaticsRuntimeHooks['fetch'] {
  return (url, init): Promise<Response> => {
    counter.sent += 1;

    return fetch(url, dispatchedThroughMock(init));
  };
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
        // `auto`, with the platform's languages as the only candidates and a
        // fallback: a file short enough to defeat identification is
        // transcribed rather than refused.
        transcription_config: { language: 'auto', operating_point: 'enhanced' },
        language_identification_config: {
          expected_languages: ['es', 'en', 'ca', 'eu', 'gl'],
          low_confidence_action: 'use_default_language',
          default_language: 'es',
        },
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
        callbackUrl: CALLBACK_URL,
      });

      const body = firstRequest().body;
      if (!(body instanceof FormData))
        throw new Error('the job was not submitted as multipart form data');

      // `data_file` is the field that would carry the bytes, so its absence is
      // what this asserts, not merely that `fetch_data` is present.
      expect([...body.keys()]).toEqual(['config']);
      expect(body.get('data_file')).toBeNull();
    });

    it('does not retry a request the provider rejected', async () => {
      interceptJobs({ status: 400, body: { error: 'Invalid fetch_data url' } });
      const { provider, delays } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
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
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      expect(error.message).not.toMatch(/403|Forbidden/);
      expect(error.message).toBe(
        'The transcription provider could not complete the request: submitFileJob was rejected by the provider',
      );
    });

    it.each([
      ['the quota window has not rolled over', 429, 'sm-job-77'],
      ['the provider gave up waiting for the request', 408, 'sm-job-84'],
    ])('resubmits when %s', async (_case, status, jobId) => {
      interceptJobs({ status }, { status: 201, body: { id: jobId } });
      const { provider, delays } = buildProvider();

      const job = await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        callbackUrl: CALLBACK_URL,
      });

      // Both statuses say the request was refused outright, so no job can
      // exist behind either and sending it again cannot duplicate one.
      expect(job.externalJobId).toBe(jobId);
      expect(requests).toHaveLength(2);
      // Equal jitter with `random` pinned to 1: half the exponential term is
      // fixed, half is the pinned draw, so the first delay is the base delay.
      expect(delays).toEqual([100]);
    });

    it('splits the backoff into a fixed half and a jittered half', async () => {
      interceptJobs({ status: 429 }, { status: 201, body: { id: 'sm-job-87' } });
      // A draw of 1 is the single value where equal jitter and no jitter
      // agree, so the other tests cannot tell them apart. Half of the 100 ms
      // base delay is fixed and half is drawn: 50 + 50 * 0.5.
      const { provider, delays } = buildProvider({}, { random: (): number => 0.5 });

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        callbackUrl: CALLBACK_URL,
      });

      expect(delays).toEqual([75]);
    });

    it('does not skip the backoff when a dated Retry-After has already passed', async () => {
      interceptJobs(
        { status: 429, headers: { 'retry-after': 'Tue, 11 Aug 2026 08:59:53 GMT' } },
        { status: 201, body: { id: 'sm-job-88' } },
      );
      const { provider, delays } = buildProvider();

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        callbackUrl: CALLBACK_URL,
      });

      // Seven seconds before the injected clock. Subtracting without a floor
      // gives a negative delay, which a timer treats as no wait at all, so the
      // next attempt goes straight into the rate limit just reported.
      expect(delays).toEqual([0]);
    });

    it('drains the body of a response nothing will read', async () => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller): void {
          controller.enqueue(new TextEncoder().encode('{"error":"Invalid config"}'));
        },
        cancel(): void {
          cancelled = true;
        },
      });
      const { provider } = buildProvider(
        { maxAttempts: 1 },
        { fetch: (): Promise<Response> => Promise.resolve(new Response(body, { status: 400 })) },
      );

      await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      // An undici socket stays checked out of the pool until its body is read
      // or cancelled, so leaving a failed response undrained leaks one
      // connection per failure — and failures come in bursts.
      expect(cancelled).toBe(true);
    });

    it('does not resubmit a job a server fault answered', async () => {
      interceptJobs({ status: 500 }, { status: 201, body: { id: 'sm-job-85' } });
      const attempts = { sent: 0 };
      const { provider, delays } = buildProvider({}, { fetch: countingFetch(attempts) });

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      // The provider documents no idempotency key, so a 5xx cannot be told
      // apart from an edge proxy answering for a server that already created
      // the job. Retrying transcribes the same audio twice, and the losing
      // job's callback carries an id no record holds.
      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(attempts.sent).toBe(1);
      expect(delays).toEqual([]);
    });

    it('does not resubmit a job the provider never answered', async () => {
      agent
        .get(BATCH_ORIGIN)
        .intercept({ path: JOBS_PATH, method: 'POST' })
        .replyWithError(new Error('socket hang up'));
      interceptJobs({ status: 201, body: { id: 'sm-job-86' } });
      const attempts = { sent: 0 };
      const { provider, delays, logger } = buildProvider({}, { fetch: countingFetch(attempts) });

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      // A request that produced no response may still have been received. The
      // adapter cannot tell, so it reports a failure the caller can act on
      // rather than creating a job that might be the second one.
      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(attempts.sent).toBe(1);
      expect(delays).toEqual([]);

      // The cause's own message is not repeated: a fetch failure names the
      // url it was fetching, and here that is the presigned link to a
      // patient's audio.
      const written = logger.serialise();
      expect(written).toContain('the request could not be completed');
      expect(written).not.toContain(AUDIO_URL);
    });

    it('waits the number of seconds a 429 asked for', async () => {
      interceptJobs(
        { status: 429, headers: { 'retry-after': '3' } },
        { status: 201, body: { id: 'sm-job-78' } },
      );
      const { provider, delays } = buildProvider();

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
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
        callbackUrl: CALLBACK_URL,
      });

      // Resolved against the injected clock, seven seconds after `NOW`.
      expect(delays).toEqual([7_000]);
    });

    it('gives up after the configured number of attempts', async () => {
      interceptJobs({ status: 429 }, { status: 429 }, { status: 429 });
      const { provider, delays, logger } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(requests).toHaveLength(3);
      // Two waits for three attempts: nothing sleeps after the last one.
      expect(delays).toEqual([100, 200]);

      // The level is asserted, not the text alone: this line is the only
      // record that a clinical transcription will never happen, and at `info`
      // it vanishes the moment an operator raises LOG_LEVEL to cut noise.
      expect(logger.entries).toContainEqual({
        level: 'error',
        message: 'Transcription provider request exhausted its attempts',
        context: {
          operation: 'submitFileJob',
          attempts: 3,
          reason: 'the provider returned a retryable status',
        },
      });
    });

    it('never waits longer than the configured ceiling, whatever Retry-After asks for', async () => {
      interceptJobs(
        { status: 429, headers: { 'retry-after': '3600' } },
        { status: 201, body: { id: 'sm-job-81' } },
      );
      const { provider, delays } = buildProvider({ maxRetryDelayMs: 5_000 });

      await provider.submitFileJob({
        audioUrl: AUDIO_URL,
        callbackUrl: CALLBACK_URL,
      });

      // An hour is longer than any Lambda may run, so honouring it literally
      // would trade a retry for a certain timeout.
      expect(delays).toEqual([5_000]);
    });

    it('abandons a request that outlives the configured timeout', async () => {
      interceptJobs({ status: 201, body: { id: 'sm-job-80' }, delayMs: 400 });
      const { provider, logger } = buildProvider({ maxAttempts: 1, requestTimeoutMs: 40 });

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
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
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(error.message).toContain('returned no job id');
    });

    it.each([
      ['a body that is not JSON', 'the gateway ate it', 'not valid JSON'],
      ['a JSON body that is not an object', ['sm-job-83'], 'an unexpected body'],
    ])('rejects a 2xx carrying %s', async (_case, body, expected) => {
      interceptJobs({ status: 201, body });
      const { provider } = buildProvider();

      const error = await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
      );

      // A 201 whose body cannot be read is not a submitted job. Treating it as
      // one marks the transcription PROCESSING against a job id that does not
      // exist, where it sits until a reconciler notices.
      expect((error as { code?: unknown }).code).toBe('TRANSCRIPTION_PROVIDER_FAILED');
      expect(error.message).toContain(expected);
    });

    it('never writes the api key or the webhook secret into a log line', async () => {
      interceptJobs({ status: 429 }, { status: 400, body: { error: 'Invalid config' } });
      const { provider, logger } = buildProvider();

      await expectProviderError(
        provider.submitFileJob({ audioUrl: AUDIO_URL, callbackUrl: CALLBACK_URL }),
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

    // A ttl outside the documented range comes back as a 400, which this
    // adapter refuses to retry, so an unclamped value costs the session. The
    // reported expiry has to move with the clamp too: a caller told its key
    // lasts a day when a minute was issued reconnects onto a dead key.
    it.each([
      ['below the provider minimum', 5, 60],
      ['above the provider maximum', 100_000, 86_400],
      ['carrying a fraction of a second', 90.7, 90],
    ])('brings a ttl %s into the range the provider accepts', async (_case, requested, applied) => {
      interceptTemporaryKeys({ status: 201, body: { key_value: 'temporary-jwt-value' } });
      const { provider, logger } = buildProvider();

      const credentials = await provider.createRealtimeCredentials({ ttlSeconds: requested });

      expect(firstRequest().body).toBe(JSON.stringify({ ttl: applied }));
      expect(credentials.expiresAt).toEqual(new Date(NOW.getTime() + applied * 1_000));
      expect(logger.serialise()).toContain('Clamped the realtime key lifetime');
    });

    it('retries a server fault, which submitting a job deliberately does not', async () => {
      interceptTemporaryKeys(
        { status: 503 },
        { status: 201, body: { key_value: 'temporary-jwt-value' } },
      );
      const { provider, delays } = buildProvider();

      const credentials = await provider.createRealtimeCredentials({ ttlSeconds: 60 });

      // Minting a key has no second effect: a duplicate is one unused key that
      // expires within the minute. That is what makes the ambiguity of a 5xx
      // worth another attempt here and not on the submission.
      expect(credentials.token).toBe('temporary-jwt-value');
      expect(requests).toHaveLength(2);
      expect(delays).toEqual([100]);
    });

    it('retries a request that never reached the provider at all', async () => {
      agent
        .get(MANAGEMENT_ORIGIN)
        .intercept({ path: KEYS_PATH, method: 'POST', query: { type: 'rt' } })
        .replyWithError(new Error('socket hang up'));
      interceptTemporaryKeys({ status: 201, body: { key_value: 'temporary-jwt-value' } });
      const attempts = { sent: 0 };
      const { provider, delays, logger } = buildProvider({}, { fetch: countingFetch(attempts) });

      const credentials = await provider.createRealtimeCredentials({ ttlSeconds: 60 });

      expect(credentials.token).toBe('temporary-jwt-value');
      expect(attempts.sent).toBe(2);
      expect(delays).toEqual([100]);
      // A retried request is a problem being handled, so it is written at
      // `warn`: an operator cutting noise to `warn` keeps it and loses only
      // the routine progress lines.
      expect(logger.entries.map((entry) => entry.level)).toEqual(['warn']);
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

  /**
   * The translation itself is pinned against real payloads in
   * `speechmatics-callback.test.ts`. What these two assert is that it is
   * reachable through the port, because a translation nothing can call leaves
   * the webhook route's coupling to the vendor exactly where it was.
   */
  describe('interpretCallback', () => {
    it('answers a success callback in the platform terms the caller expects', async () => {
      const { provider } = buildProvider();

      const outcome = await provider.interpretCallback({
        query: { id: 'job-1', status: 'success' },
        body: JSON.stringify({
          job: { duration: 12 },
          results: [{ type: 'word', end_time: 1, alternatives: [{ content: 'hola' }] }],
        }),
      });

      expect(outcome).toEqual({
        kind: 'completed',
        externalJobId: 'job-1',
        text: 'hola',
        durationSeconds: 12,
        language: null,
      });
    });

    it('answers without going near the network', async () => {
      // The count is the honest assertion: reading a callback body must not
      // cost a round trip to the provider.
      const { provider, secrets } = buildProvider();

      await provider.interpretCallback({ query: { id: 'job-1', status: 'error' }, body: '' });

      expect(requests).toHaveLength(0);
      // Nor a secret. Nothing here is authenticated against the provider; the
      // callback's own credential was checked before this was ever called.
      expect(secrets.requested).toHaveLength(0);
    });
  });
});
