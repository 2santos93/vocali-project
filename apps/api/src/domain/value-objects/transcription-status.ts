import type { TranscriptionStatus } from '@vocali/contracts';

/** COMPLETED and FAILED are terminal: a finished transcription never changes again. */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<TranscriptionStatus, readonly TranscriptionStatus[]>
> = {
  PENDING_UPLOAD: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

export function canTransition(from: TranscriptionStatus, to: TranscriptionStatus): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}
