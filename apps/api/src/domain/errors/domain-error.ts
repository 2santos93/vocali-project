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

/**
 * Carries the reason rather than the rejected name: the name is client-supplied
 * and may be long or full of control characters, neither of which belongs in a
 * message that ends up in a log line or an HTTP response.
 */
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

/**
 * Raised when the transcription provider could not be made to do its job:
 * it rejected the request, it stayed unreachable across every retry, or it
 * answered with something the adapter cannot read.
 *
 * The reason is written for a person and deliberately carries no HTTP status,
 * no response body and no request detail. A provider's status code describes a
 * conversation the client was never part of, and repeating it invites a
 * frontend to branch on a third party's numbering. One code, one remedy: the
 * transcription did not start, so try again.
 */
export class TranscriptionProviderError extends DomainError {
  readonly code = 'TRANSCRIPTION_PROVIDER_FAILED';

  constructor(reason: string) {
    super(`The transcription provider could not complete the request: ${reason}`);
  }
}

/**
 * Raised when a pagination cursor cannot be decoded, or was not issued for
 * the user requesting the page. A malformed or foreign cursor is
 * attacker-controlled input arriving over HTTP, so it is an expected
 * failure the caller must handle, not an exceptional condition.
 */
export class InvalidCursorError extends DomainError {
  readonly code = 'INVALID_CURSOR';

  constructor(reason: string) {
    super(`Invalid pagination cursor: ${reason}`);
  }
}
