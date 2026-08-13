import type {
  AudioFileTooLargeError,
  InvalidAudioFileNameError,
  InvalidAudioFileSizeError,
  UnsupportedAudioFormatError,
} from '../errors/domain-error.js';

export interface AudioFileInput {
  readonly fileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export type AudioFileError =
  | UnsupportedAudioFormatError
  | InvalidAudioFileSizeError
  | AudioFileTooLargeError
  | InvalidAudioFileNameError;

export interface PresignedUpload {
  readonly url: string;
  readonly fields: Record<string, string>;
  readonly expiresAt: Date;
}
