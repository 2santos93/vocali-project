import type { LOG_LEVELS } from '../logging/pino-logger.js';

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface SpeechmaticsProviderOptions {
  /** An SSM parameter path, not the key itself. */
  readonly apiKeySecretName: string;
  /** An SSM parameter path, not the secret itself. */
  readonly webhookSecretName: string;
  readonly requestTimeoutMs: number;
  readonly maxAttempts: number;
  readonly retryBaseDelayMs: number;
  readonly maxRetryDelayMs: number;
}

export interface AppConfig {
  readonly region: string;
  readonly audioBucketName: string;
  readonly transcriptsBucketName: string;
  readonly transcriptionsTableName: string;
  readonly providerCallbackBaseUrl: string;
  readonly websocketUrl: string;
  readonly websocketManagementEndpoint: string;
  readonly logLevel: LogLevel;
  readonly speechmatics: SpeechmaticsProviderOptions;
}
