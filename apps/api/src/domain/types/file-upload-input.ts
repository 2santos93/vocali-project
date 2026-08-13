import type { AudioFile } from '../value-objects/audio-file.js';

export interface FileUploadInput {
  readonly id: string;
  readonly userId: string;
  readonly audioFile: AudioFile;
  readonly audioObjectKey: string;
  readonly createdAt: Date;
}
