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
