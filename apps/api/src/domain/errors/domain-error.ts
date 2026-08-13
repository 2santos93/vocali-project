import type { DomainErrorCode } from '@vocali/contracts/constants';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedAudioFormatError extends DomainError {
  readonly code = 'UNSUPPORTED_AUDIO_FORMAT';

  constructor(contentType: string) {
    super(`Audio format "${contentType}" is not supported`);
  }
}

export class InvalidAudioFileSizeError extends DomainError {
  readonly code = 'INVALID_AUDIO_FILE_SIZE';

  constructor(sizeBytes: number) {
    super(`Audio file size ${String(sizeBytes)} is not a valid positive whole number of bytes`);
  }
}

export class AudioFileTooLargeError extends DomainError {
  readonly code = 'AUDIO_FILE_TOO_LARGE';

  constructor(sizeBytes: number, maxSizeBytes: number) {
    super(
      `Audio file of ${String(sizeBytes)} bytes exceeds the ${String(maxSizeBytes)} byte limit`,
    );
  }
}

export class InvalidAudioFileNameError extends DomainError {
  readonly code = 'INVALID_AUDIO_FILE_NAME';

  constructor(reason: string) {
    super(`Audio file name is not valid: ${reason}`);
  }
}

export class TranscriptionNotFoundError extends DomainError {
  readonly code = 'TRANSCRIPTION_NOT_FOUND';

  constructor(transcriptionId: string) {
    super(`Transcription "${transcriptionId}" was not found`);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(from: string, to: string) {
    super(`A transcription cannot move from "${from}" to "${to}"`);
  }
}

export class TranscriptionNotReadyError extends DomainError {
  readonly code = 'TRANSCRIPTION_NOT_READY';

  constructor(status: string) {
    super(`Transcription is "${status}" and has no transcript to download yet`);
  }
}

export class TranscriptionProviderError extends DomainError {
  readonly code = 'TRANSCRIPTION_PROVIDER_FAILED';

  constructor(reason: string) {
    super(`The transcription provider could not complete the request: ${reason}`);
  }
}

export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';

  constructor(reason: string) {
    super(`Invalid pagination cursor: ${reason}`);
  }
}

export class ConcurrentModificationError extends Error {
  readonly code = 'CONCURRENT_MODIFICATION';

  constructor(transcriptionId: string) {
    super(`Transcription "${transcriptionId}" was modified by another writer`);
    this.name = 'ConcurrentModificationError';
  }
}
