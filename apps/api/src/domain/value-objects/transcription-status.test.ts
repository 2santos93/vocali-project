import { canTransition } from './transcription-status.js';

describe('canTransition', () => {
  it.each([
    ['PENDING_UPLOAD', 'PROCESSING'],
    ['PENDING_UPLOAD', 'FAILED'],
    ['PROCESSING', 'COMPLETED'],
    ['PROCESSING', 'FAILED'],
  ] as const)('allows %s to %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['COMPLETED', 'PROCESSING'],
    ['COMPLETED', 'FAILED'],
    ['FAILED', 'COMPLETED'],
    ['PENDING_UPLOAD', 'COMPLETED'],
  ] as const)('forbids %s to %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
