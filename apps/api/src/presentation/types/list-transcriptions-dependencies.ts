import type { ListUserTranscriptions } from '../../application/use-cases/list-user-transcriptions.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface ListTranscriptionsDependencies {
  readonly useCase: ListUserTranscriptions;
  readonly logger: Logger;
}
