import { z } from 'zod';
import { LOG_LEVELS, type LogLevel } from '../logging/pino-logger.js';
import type { SpeechmaticsProviderOptions } from '../providers/speechmatics-transcription-provider.js';

/**
 * Backoff shape, not deployment configuration. An operator reaching for a
 * lever during an incident reaches for the timeout or the attempt count;
 * nobody has ever wanted to retune a jitter base from the console, and every
 * variable that exists is one more that can be missing or wrong.
 */
const PROVIDER_RETRY_BASE_DELAY_MS = 250;
const PROVIDER_MAX_RETRY_DELAY_MS = 10_000;

/**
 * Environment values arrive as strings, so a numeric variable is coerced and
 * then constrained. `.default()` runs before coercion, so an absent variable
 * takes the number written here rather than being coerced from `undefined`
 * into `NaN`.
 */
const PositiveInteger = (fallback: number): z.ZodDefault<z.ZodNumber> =>
  z.coerce.number().int().positive().default(fallback);

const EnvironmentSchema = z.object({
  /**
   * Reserved by Lambda: a function definition cannot set this key, the runtime
   * supplies it. It is validated here because the code depends on it, not
   * because a deployment can provide it — outside Lambda (a test, a local
   * script) it has to be set by whoever runs the process.
   */
  AWS_REGION: z.string().min(1),
  /** Uploaded audio only. The two buckets are separate grants in every role. */
  AUDIO_BUCKET_NAME: z.string().min(1),
  /**
   * Produced transcripts only. Writing one into the audio bucket is denied by
   * IAM at the moment of the write, after the provider has already
   * transcribed and billed for the job.
   */
  TRANSCRIPTS_BUCKET_NAME: z.string().min(1),
  TRANSCRIPTIONS_TABLE_NAME: z.string().min(1),
  /** Parameter Store paths, not the secrets themselves. */
  SPEECHMATICS_API_KEY_PARAMETER: z.string().min(1),
  SPEECHMATICS_WEBHOOK_SECRET_PARAMETER: z.string().min(1),
  /** The transcription's identity is appended to this per job; see ruling R12. */
  PROVIDER_CALLBACK_BASE_URL: z.string().url(),
  PROVIDER_REQUEST_TIMEOUT_MS: PositiveInteger(10_000),
  PROVIDER_MAX_ATTEMPTS: PositiveInteger(3),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export interface AppConfig {
  readonly region: string;
  readonly audioBucketName: string;
  readonly transcriptsBucketName: string;
  readonly transcriptionsTableName: string;
  readonly providerCallbackBaseUrl: string;
  readonly logLevel: LogLevel;
  readonly speechmatics: SpeechmaticsProviderOptions;
}

/**
 * Raised when the environment cannot produce a usable configuration.
 *
 * It names every offending variable rather than the first, because a
 * misconfigured deployment usually misses several and fixing them one
 * redeploy at a time is how an afternoon disappears. It names no values: the
 * message ends up in a log, and one of these variables is a path an operator
 * chose and the rest are whatever was actually set.
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
 * fails while the container is initialising. A Lambda that boots happily and
 * then throws on its first request reports that as a 500 on a user's action,
 * possibly hours after the deploy that caused it.
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
