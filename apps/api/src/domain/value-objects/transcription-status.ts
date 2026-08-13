import type { TranscriptionStatus } from '@vocali/contracts/constants';

/**
 * COMPLETED is terminal, with no self-loop, so a duplicate or late webhook can
 * never overwrite a good transcript. FAILED is not terminal: a timeout failure
 * may be recorded before a late transcript arrives, and losing real
 * transcribed data would be worse than model purity.
 */
const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<TranscriptionStatus, readonly TranscriptionStatus[]>
> = {
  PENDING_UPLOAD: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['COMPLETED'],
};

/**
 * Indexed through a widened key on purpose. `noUncheckedIndexedAccess` does
 * not guard a `Record` keyed by a closed union, so it offers no protection at
 * the persistence boundary, where a stored string is cast back to
 * `TranscriptionStatus` and may match no known status. Widening makes an
 * unmapped status forbid every transition instead of throwing.
 */
export function canTransition(from: TranscriptionStatus, to: TranscriptionStatus): boolean {
  const allowedTargets = (
    ALLOWED_STATUS_TRANSITIONS as Record<string, readonly TranscriptionStatus[] | undefined>
  )[from];

  return allowedTargets?.includes(to) ?? false;
}
