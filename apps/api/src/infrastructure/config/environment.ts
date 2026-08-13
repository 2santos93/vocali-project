import { z } from 'zod';
import { LOG_LEVELS } from '../logging/pino-logger.js';
import type { AppConfig } from '../types/config.js';

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
   * Outside Lambda (a test, a local script), whoever runs the process must.
   */
  AWS_REGION: z.string().min(1),
  AUDIO_BUCKET_NAME: z.string().min(1),
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
  WEBSOCKET_MANAGEMENT_ENDPOINT: z.string().url(),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export class InvalidEnvironmentError extends Error {
  readonly code = 'INVALID_ENVIRONMENT';

  constructor(reasons: readonly string[]) {
    super(`Environment is not usable: ${reasons.join(', ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

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
