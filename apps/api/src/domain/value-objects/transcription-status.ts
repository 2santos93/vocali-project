import type { TranscriptionStatus } from '@vocali/contracts/constants';

const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<TranscriptionStatus, readonly TranscriptionStatus[]>
> = {
  PENDING_UPLOAD: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['COMPLETED'],
};

export function canTransition(from: TranscriptionStatus, to: TranscriptionStatus): boolean {
  const allowedTargets = (
    ALLOWED_STATUS_TRANSITIONS as Record<string, readonly TranscriptionStatus[] | undefined>
  )[from];

  return allowedTargets?.includes(to) ?? false;
}
