import type { GetTranscriptionDownloadUrl } from '../../application/use-cases/get-transcription-download-url.js';
import type { Logger } from '../../domain/ports/logger.js';

export interface GetTranscriptionDownloadUrlDependencies {
  readonly useCase: GetTranscriptionDownloadUrl;
  readonly logger: Logger;
}
