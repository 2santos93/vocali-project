import { MAX_AUDIO_FILE_SIZE_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES } from '@vocali/contracts';
import {
  AudioFileTooLargeError,
  InvalidAudioFileSizeError,
  UnsupportedAudioFormatError,
} from '../errors/domain-error.js';
import { err, ok, type Result } from '../shared/result.js';

interface AudioFileInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

type AudioFileError =
  UnsupportedAudioFormatError | InvalidAudioFileSizeError | AudioFileTooLargeError;

/**
 * An AudioFile cannot exist in an invalid state: the only way to obtain one is
 * through `create`, which enforces every rule the platform accepts.
 *
 * The private `brand` field is not read anywhere; its only purpose is to make
 * this class nominal. Without it, a private *constructor* alone does not stop
 * a structurally matching plain object (e.g. a naive DynamoDB-row mapper)
 * from being assigned to the `AudioFile` type, bypassing every check below.
 */
export class AudioFile {
  private readonly brand = Symbol('AudioFile');

  private constructor(
    readonly fileName: string,
    readonly contentType: string,
    readonly sizeBytes: number,
  ) {}

  static create(input: AudioFileInput): Result<AudioFile, AudioFileError> {
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
