import type { TranscriptFormat } from '@vocali/contracts';

export interface GetTranscriptionDownloadUrlInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly format: TranscriptFormat;
}
