import type {
  TranscriptionNotFoundError,
  TranscriptionNotReadyError,
} from '../../domain/errors/domain-error.js';

export type GetTranscriptionDownloadUrlError =
  TranscriptionNotFoundError | TranscriptionNotReadyError;
