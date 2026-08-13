import type { StartFileTranscription } from '../../application/use-cases/start-file-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface StartTranscriptionJobDependencies {
  readonly useCase: StartFileTranscription;
  readonly logger: Logger;
}
