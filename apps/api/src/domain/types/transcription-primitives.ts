import type {
  TranscriptionLanguage,
  TranscriptionSource,
  TranscriptionStatus,
} from '@vocali/contracts/constants';

export interface TranscriptionPrimitives {
  readonly id: string;
  readonly userId: string;
  /**
   * The revision this entity was read at; `0` means never stored, so the first
   * write is an insert. Mutating the entity deliberately does not touch it —
   * the write must match what the store held at read time, not the number of
   * changes made since.
   */
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
