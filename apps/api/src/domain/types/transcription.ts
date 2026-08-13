import type {
  TranscriptionLanguage,
  TranscriptionSource,
  TranscriptionStatus,
} from '@vocali/contracts/constants';
import type { AudioFile } from '../value-objects/audio-file.js';

export interface TranscriptionPrimitives {
  readonly id: string;
  readonly userId: string;
  readonly version: number;
  readonly fileName: string;
  readonly source: TranscriptionSource;
  readonly status: TranscriptionStatus;
  /** Null on an uploaded file until the completion webhook records it. */
  readonly language: TranscriptionLanguage | null;
  readonly sizeBytes: number | null;
  readonly durationSeconds: number | null;
  readonly audioObjectKey: string | null;
  readonly transcriptObjectKey: string | null;
  readonly externalJobId: string | null;
  readonly textPreview: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TranscriptionPage {
  readonly items: readonly TranscriptionPrimitives[];
  readonly nextCursor: string | null;
}

export interface FileUploadInput {
  readonly id: string;
  readonly userId: string;
  readonly audioFile: AudioFile;
  readonly audioObjectKey: string;
  readonly createdAt: Date;
}

export interface RealtimeSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly language: TranscriptionLanguage;
  readonly durationSeconds: number;
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly createdAt: Date;
}

export interface CompletionInput {
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly durationSeconds: number;
  /**
   * Null leaves whatever the record already held: a completion that identified
   * nothing must not erase a language.
   */
  readonly language: TranscriptionLanguage | null;
  readonly at: Date;
}
