import type { LogLevel } from './log-level.js';
import type { SpeechmaticsProviderOptions } from './speechmatics-provider-options.js';

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
