import type { TranscriptionLanguage } from '@vocali/contracts/constants';

export interface RealtimeSessionInput {
  readonly id: string;
  readonly userId: string;
  readonly language: TranscriptionLanguage;
  readonly durationSeconds: number;
  readonly transcriptObjectKey: string;
  readonly text: string;
  readonly createdAt: Date;
}
