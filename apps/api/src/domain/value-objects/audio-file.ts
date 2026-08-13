import {
  MAX_AUDIO_FILE_SIZE_BYTES,
  SUPPORTED_AUDIO_CONTENT_TYPES,
} from '@vocali/contracts/constants';
import {
  AudioFileTooLargeError,
  InvalidAudioFileNameError,
  InvalidAudioFileSizeError,
  UnsupportedAudioFormatError,
} from '../errors/domain-error.js';
import { err, ok } from '../shared/result.js';
import type { AudioFileError } from '../types/audio-file-error.js';
import type { AudioFileInput } from '../types/audio-file-input.js';
import type { Result } from '../types/result.js';

const MAX_FILE_NAME_LENGTH = 255;

/**
 * The private `brand` field is never read; its only purpose is to make this
 * class nominal. Without it, a private *constructor* alone does not stop a
 * structurally matching plain object — a naive DynamoDB-row mapper, say —
 * being assigned to the `AudioFile` type, bypassing every check below.
 */
export class AudioFile {
  private readonly brand = Symbol('AudioFile');

  private constructor(
    readonly fileName: string,
    readonly contentType: string,
    readonly sizeBytes: number,
  ) {}

  static create(input: AudioFileInput): Result<AudioFile, AudioFileError> {
    const fileNameProblem = findFileNameProblem(input.fileName);
    if (fileNameProblem !== null) {
      return err(new InvalidAudioFileNameError(fileNameProblem));
    }

    if (!isSupportedContentType(input.contentType)) {
      return err(new UnsupportedAudioFormatError(input.contentType));
    }

    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
      return err(new InvalidAudioFileSizeError(input.sizeBytes));
    }

    if (input.sizeBytes > MAX_AUDIO_FILE_SIZE_BYTES) {
      return err(new AudioFileTooLargeError(input.sizeBytes, MAX_AUDIO_FILE_SIZE_BYTES));
    }

    return ok(new AudioFile(input.fileName, input.contentType, input.sizeBytes));
  }
}

function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_AUDIO_CONTENT_TYPES.some((supported) => supported === contentType);
}

/**
 * Deliberately duplicates `SafeFileNameSchema` from `@vocali/contracts` rather
 * than reusing it: the two rules must agree, but the domain layer cannot
 * import a validation library, and this name is interpolated into the object
 * key an upload is signed for whether or not presentation code ran first.
 *
 * Spanish clinical file names are the norm here, so spaces and accented
 * characters must stay allowed — `\p{C}` matches neither.
 */
function findFileNameProblem(fileName: string): string | null {
  if (fileName.length === 0) {
    return 'it must not be empty';
  }

  if (fileName.length > MAX_FILE_NAME_LENGTH) {
    return `it must be at most ${String(MAX_FILE_NAME_LENGTH)} characters`;
  }

  if (/\p{C}/u.test(fileName)) {
    return 'it must not contain control characters';
  }

  if (/[/\\]/.test(fileName)) {
    return 'it must not contain path separators';
  }

  if (fileName.includes('..')) {
    return 'it must not contain a ".." sequence';
  }

  return null;
}
