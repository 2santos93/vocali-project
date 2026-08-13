import type {
  AudioFileTooLargeError,
  InvalidAudioFileNameError,
  InvalidAudioFileSizeError,
  UnsupportedAudioFormatError,
  TranscriptionNotFoundError,
  InvalidStatusTransitionError,
  TranscriptionNotReadyError,
} from '../../domain/errors/domain-error.js';

export type CreateAudioUploadIntentError =
  | UnsupportedAudioFormatError
  | InvalidAudioFileSizeError
  | AudioFileTooLargeError
  | InvalidAudioFileNameError;

export type StartFileTranscriptionError = TranscriptionNotFoundError;

export type CompleteTranscriptionError = TranscriptionNotFoundError | InvalidStatusTransitionError;

export type FailTranscriptionError = TranscriptionNotFoundError;

export type GetTranscriptionDownloadUrlError =
  TranscriptionNotFoundError | TranscriptionNotReadyError;
