import type { CompleteTranscription } from '../../application/use-cases/complete-transcription.js';
import type { FailTranscription } from '../../application/use-cases/fail-transcription.js';
import type { PublishTranscriptionUpdate } from '../../application/use-cases/publish-transcription-update.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import type { TranscriptionProvider } from '../../domain/ports/transcription-provider.js';

export interface HandleProviderCallbackDependencies {
  readonly completeTranscription: CompleteTranscription;
  readonly failTranscription: FailTranscription;
  readonly publishTranscriptionUpdate: PublishTranscriptionUpdate;
  readonly transcriptionProvider: TranscriptionProvider;
  readonly secrets: SecretsProvider;
  /** Parameter Store path of the shared secret the provider echoes back. */
  readonly webhookSecretName: string;
  readonly logger: Logger;
}
