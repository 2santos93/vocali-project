import type { CreateAudioUploadIntent } from '../../application/use-cases/create-audio-upload-intent.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface CreateUploadIntentDependencies {
  readonly useCase: CreateAudioUploadIntent;
  readonly logger: Logger;
}
