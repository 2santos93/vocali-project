import type { GetTranscription } from '../../application/use-cases/get-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface GetTranscriptionDependencies {
  readonly useCase: GetTranscription;
  readonly logger: Logger;
}
