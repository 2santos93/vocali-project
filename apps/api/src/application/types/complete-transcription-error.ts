import type {
  InvalidStatusTransitionError,
  TranscriptionNotFoundError,
} from '../../domain/errors/domain-error.js';

export type CompleteTranscriptionError = TranscriptionNotFoundError | InvalidStatusTransitionError;
