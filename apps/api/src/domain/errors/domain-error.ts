export abstract class DomainError extends Error {
  abstract readonly code: string;

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

export class AudioFileTooLargeError extends DomainError {
  readonly code = 'AUDIO_FILE_TOO_LARGE';

  constructor(sizeBytes: number, maxSizeBytes: number) {
    super(
      `Audio file of ${String(sizeBytes)} bytes exceeds the ${String(maxSizeBytes)} byte limit`,
    );
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
