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
import { err, ok, type Result } from '../shared/result.js';

const MAX_FILE_NAME_LENGTH = 255;

interface AudioFileInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

type AudioFileError =
  | UnsupportedAudioFormatError
  | InvalidAudioFileSizeError
  | AudioFileTooLargeError
  | InvalidAudioFileNameError;

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
 * The file name is interpolated into the object key an upload is signed for,
 * so the rules that keep that key well-formed belong here rather than only in
 * the request schema: a value object that promises invalid states cannot exist
 * has to enforce the promise itself, without depending on presentation code
 * having run first.
 *
 * Deliberately hand-rolled rather than reusing `SafeFileNameSchema` from
 * `@vocali/contracts`: the two rules must agree, but the domain layer cannot
 * import a validation library. Returns the reason so the caller can say which
 * rule was broken; `null` means the name is acceptable.
 *
 * Spanish clinical file names are the norm here, so spaces and accented
 * characters are explicitly allowed — `\p{C}` matches neither.
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
