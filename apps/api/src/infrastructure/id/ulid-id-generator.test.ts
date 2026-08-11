import { decodeTime, isValid } from 'ulid';
import { UlidIdGenerator } from './ulid-id-generator.js';

/** Crockford's base32: no I, L, O or U, so no digit-letter confusion. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe('UlidIdGenerator', () => {
  it('produces canonical ULIDs', () => {
    const id = new UlidIdGenerator().next();

    expect(id).toMatch(ULID_PATTERN);
    expect(isValid(id)).toBe(true);
    expect(decodeTime(id)).toBeLessThanOrEqual(Date.now());
  });

  it('keeps ids sorting in the order they were issued, even within one millisecond', () => {
    const generator = new UlidIdGenerator();
    // A tight loop lands many of these in the same millisecond, which is where
    // plain ULIDs fall back to random entropy and lose their order. That is
    // not cosmetic: `SK = TRANS#<id>` queried descending IS the newest-first
    // history, so ids that do not sort chronologically are pages of history
    // in the wrong sequence.
    const ids = Array.from({ length: 1_000 }, () => generator.next());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
