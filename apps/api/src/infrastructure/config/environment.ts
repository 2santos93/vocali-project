import { z } from 'zod';
import { LOG_LEVELS } from '../logging/pino-logger.js';
import type { AppConfig } from '../types/config.js';

/**
 * Backoff shape, not deployment configuration: an operator reaches for the
 * timeout or the attempt count during an incident, never a jitter base, and
 * every variable that exists is one more that can be missing or wrong.
 */
const PROVIDER_RETRY_BASE_DELAY_MS = 250;
const PROVIDER_MAX_RETRY_DELAY_MS = 10_000;

/**
 * `.default()` runs before coercion, so an absent variable takes the number
 * written here rather than being coerced from `undefined` into `NaN`.
 */
const PositiveInteger = (fallback: number): z.ZodDefault<z.ZodNumber> =>
  z.coerce.number().int().positive().default(fallback);

const EnvironmentSchema = z.object({
  /**
   * Supplied by the Lambda runtime; a function definition cannot set this key.
   * Outside Lambda — a test, a local script — whoever runs the process must.
   */
  AWS_REGION: z.string().min(1),
  AUDIO_BUCKET_NAME: z.string().min(1),
  /**
   * A separate bucket, and a separate grant in every role. Writing a transcript
   * into the audio bucket is denied by IAM at the moment of the write, after
   * the provider has already transcribed and billed for the job.
   */
  TRANSCRIPTS_BUCKET_NAME: z.string().min(1),
  TRANSCRIPTIONS_TABLE_NAME: z.string().min(1),
  /** Parameter Store paths, not the secrets themselves. */
  SPEECHMATICS_API_KEY_PARAMETER: z.string().min(1),
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: z.string().min(1),
  PROVIDER_CALLBACK_BASE_URL: z.string().url(),
  PROVIDER_REQUEST_TIMEOUT_MS: PositiveInteger(10_000),
  PROVIDER_MAX_ATTEMPTS: PositiveInteger(3),
  /** What the browser opens. Returned in the ticket response, never configured
   * into the front end, so the endpoint is written down in one place. */
  WEBSOCKET_URL: z.string().url(),
  /**
   * What the *server* posts to: the same API over `https`, and not the same
   * string. Sending to `wss://` fails at the SDK, and deriving one from the
   * other would put a scheme rewrite between a completion and the browser
   * waiting for it.
   */
  WEBSOCKET_MANAGEMENT_ENDPOINT: z.string().url(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

/**
 * Names every offending variable rather than the first, because a misconfigured
 * deployment usually misses several and fixing them one redeploy at a time is
 * how an afternoon disappears. It names no values: the message reaches a log.
 */
export class InvalidEnvironmentError extends Error {
  readonly code = 'INVALID_ENVIRONMENT';

  constructor(reasons: readonly string[]) {
    super(`Environment is not usable: ${reasons.join(', ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

/**
 * Called from the composition root at module scope, so an invalid environment
 * fails while the container initialises. A Lambda that boots happily and then
 * throws on its first request reports that as a 500 on a user's action, hours
 * after the deploy that caused it.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.safeParse(source);

  if (!parsed.success) {
    throw new InvalidEnvironmentError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')} (${issue.code})`),
    );
  }

  const environment = parsed.data;

  return {
    region: environment.AWS_REGION,
    audioBucketName: environment.AUDIO_BUCKET_NAME,
    transcriptsBucketName: environment.TRANSCRIPTS_BUCKET_NAME,
    transcriptionsTableName: environment.TRANSCRIPTIONS_TABLE_NAME,
    providerCallbackBaseUrl: environment.PROVIDER_CALLBACK_BASE_URL,
    websocketUrl: environment.WEBSOCKET_URL,
    websocketManagementEndpoint: environment.WEBSOCKET_MANAGEMENT_ENDPOINT,
    logLevel: environment.LOG_LEVEL,
    speechmatics: {
      apiKeySecretName: environment.SPEECHMATICS_API_KEY_PARAMETER,
      webhookSecretName: environment.SPEECHMATICS_WEBHOOK_SECRET_PARAMETER,
      requestTimeoutMs: environment.PROVIDER_REQUEST_TIMEOUT_MS,
      maxAttempts: environment.PROVIDER_MAX_ATTEMPTS,
      retryBaseDelayMs: PROVIDER_RETRY_BASE_DELAY_MS,
      maxRetryDelayMs: PROVIDER_MAX_RETRY_DELAY_MS,
    },
  };
}
