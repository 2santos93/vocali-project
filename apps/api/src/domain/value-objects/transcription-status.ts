import type { TranscriptionStatus } from '@vocali/contracts';

/**
 * COMPLETED is terminal: no self-loop and no outgoing transitions, so a
 * duplicate or late webhook can never overwrite a good transcript.
 *
 * FAILED is recoverable, not terminal: the reconciler may record a timeout
 * failure before a late transcript arrives, and losing real transcribed data
 * would be worse than preserving model purity.
 */
export const ALLOWED_STATUS_TRANSITIONS: Readonly<
  Record<TranscriptionStatus, readonly TranscriptionStatus[]>
> = {
  PENDING_UPLOAD: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['COMPLETED'],
};

/**
 * `Record<TranscriptionStatus, V>` indexing is not guarded by
 * `noUncheckedIndexedAccess`: TypeScript treats every key of a closed union
 * as present, so it gives no protection at the persistence boundary, where a
 * stored string is cast back to `TranscriptionStatus` and may not actually
 * match any known status (a corrupt row, or a status added after this map
 * was written). Index through a widened key so an unmapped status forbids
 * every transition instead of throwing.
 */
export function canTransition(from: TranscriptionStatus, to: TranscriptionStatus): boolean {
  const allowedTargets = (
    ALLOWED_STATUS_TRANSITIONS as Record<string, readonly TranscriptionStatus[] | undefined>
  )[from];

  return allowedTargets?.includes(to) ?? false;
}
