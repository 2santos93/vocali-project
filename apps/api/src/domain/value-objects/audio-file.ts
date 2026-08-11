import { MAX_AUDIO_FILE_SIZE_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES } from '@vocali/contracts';
import { AudioFileTooLargeError, UnsupportedAudioFormatError } from '../errors/domain-error.js';
import { err, ok, type Result } from '../shared/result.js';

interface AudioFileInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

type AudioFileError = UnsupportedAudioFormatError | AudioFileTooLargeError;

/**
 * An AudioFile cannot exist in an invalid state: the only way to obtain one is
 * through `create`, which enforces every rule the platform accepts.
 */
export class AudioFile {
  private constructor(
    readonly fileName: string,
    readonly contentType: string,
    readonly sizeBytes: number,
  ) {}

  static create(input: AudioFileInput): Result<AudioFile, AudioFileError> {
    if (!isSupportedContentType(input.contentType)) {
      return err(new UnsupportedAudioFormatError(input.contentType));
    }

    if (input.sizeBytes <= 0 || input.sizeBytes > MAX_AUDIO_FILE_SIZE_BYTES) {
      return err(new AudioFileTooLargeError(input.sizeBytes, MAX_AUDIO_FILE_SIZE_BYTES));
    }

    return ok(new AudioFile(input.fileName, input.contentType, input.sizeBytes));
  }
}

function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_AUDIO_CONTENT_TYPES.some((supported) => supported === contentType);
}
