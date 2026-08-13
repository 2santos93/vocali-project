import type { TranscriptionLanguage } from '@vocali/contracts/constants';

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
