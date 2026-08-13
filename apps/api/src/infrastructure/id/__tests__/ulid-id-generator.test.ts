import { decodeTime, isValid } from 'ulid';
import { UlidIdGenerator } from '../ulid-id-generator.js';

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
    const ids = Array.from({ length: 1_000 }, () => generator.next());

    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
