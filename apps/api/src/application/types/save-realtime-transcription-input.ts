import type { TranscriptionLanguage } from '@vocali/contracts/constants';

export interface SaveRealtimeTranscriptionInput {
  readonly userId: string;
  readonly text: string;
  readonly durationSeconds: number;
  readonly language: TranscriptionLanguage;
  readonly clientSessionId?: string | undefined;
}
