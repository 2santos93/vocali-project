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
import type { AudioFileError, AudioFileInput } from '../types/audio.js';
import type { Result } from '../types/result.js';

const MAX_FILE_NAME_LENGTH = 255;

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
