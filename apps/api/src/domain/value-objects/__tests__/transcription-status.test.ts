import type { TranscriptionStatus } from '@vocali/contracts/constants';
import { canTransition } from '../transcription-status.js';

describe('canTransition', () => {
  it.each([
    ['PENDING_UPLOAD', 'PROCESSING'],
    ['PENDING_UPLOAD', 'FAILED'],
    ['PROCESSING', 'COMPLETED'],
    ['PROCESSING', 'FAILED'],
    ['FAILED', 'COMPLETED'],
  ] as const)('allows %s to %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['COMPLETED', 'PROCESSING'],
    ['COMPLETED', 'FAILED'],
    ['PENDING_UPLOAD', 'COMPLETED'],
  ] as const)('forbids %s to %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('forbids every transition from a status that is not in the map', () => {
    const corrupted = 'ARCHIVED' as unknown as TranscriptionStatus;

    expect(canTransition(corrupted, 'PROCESSING')).toBe(false);
  });
});
