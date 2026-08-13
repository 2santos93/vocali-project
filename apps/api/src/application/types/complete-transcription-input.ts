import type { TranscriptionLanguage } from '@vocali/contracts/constants';

export interface CompleteTranscriptionInput {
  readonly userId: string;
  readonly transcriptionId: string;
  readonly externalJobId: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly language: TranscriptionLanguage | null;
}
