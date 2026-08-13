/**
 * @jest-environment node
 */
import { readTokenClaims } from '../token-claims';

function tokenWithPayload(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('reading claims', () => {
  it('returns the subject, the expiry and the address', () => {
    const token = tokenWithPayload({ sub: 'subject-1', exp: 1_800_000_000, email: 'a@b.es' });

    expect(readTokenClaims(token)).toStrictEqual({
      subject: 'subject-1',
      expiresAt: 1_800_000_000,
      email: 'a@b.es',
    });
  });

  it('reports no address when the token carries none', () => {
    // An access token does not. Only the id token has the address, which is
    // why it is stored separately rather than read from here.
    const token = tokenWithPayload({ sub: 'subject-1', exp: 1_800_000_000 });

    expect(readTokenClaims(token)?.email).toBeNull();
  });

  it('decodes base64url, not base64', () => {
    const subject = 'subject-????-with-padding';
    const token = tokenWithPayload({ sub: subject, exp: 1, extra: '<<<???>>>' });

    expect(readTokenClaims(token)?.subject).toBe(subject);
  });
});

describe('rejecting what is not a usable token', () => {
  it.each([
    ['an empty string', ''],
    ['a value with no dots', 'not-a-token'],
    ['too few segments', 'header.payload'],
    ['too many segments', 'a.b.c.d'],
    ['an empty payload segment', 'header..signature'],
    ['a payload that is not JSON', 'header.bm90IGpzb24.signature'],
  ])('returns null for %s', (_name, token) => {
    expect(readTokenClaims(token)).toBeNull();
  });

  it.each([
    ['a JSON array', []],
    ['a JSON null', null],
    ['a JSON string', 'payload'],
    ['a missing subject', { exp: 1 }],
    ['an empty subject', { sub: '', exp: 1 }],
    ['a non-string subject', { sub: 42, exp: 1 }],
    ['a missing expiry', { sub: 'subject-1' }],
    ['a non-numeric expiry', { sub: 'subject-1', exp: '1800000000' }],
  ])('returns null for %s', (_name, payload) => {
    // Validated rather than asserted: `as TokenClaims` over JSON.parse
    // compiles and then hands the refresh logic an undefined subject.
    expect(readTokenClaims(tokenWithPayload(payload))).toBeNull();
  });

  it('returns null for an infinite expiry', () => {
    // JSON has no Infinity, but a payload can carry 1e400, which parses to it
    // and would make the token appear permanently live.
    expect(readTokenClaims('header.eyJzdWIiOiJhIiwiZXhwIjoxZTQwMH0.signature')).toBeNull();
  });

  it('ignores an address that is present but empty', () => {
    const token = tokenWithPayload({ sub: 'subject-1', exp: 1, email: '' });

    expect(readTokenClaims(token)?.email).toBeNull();
  });

  it('ignores an address that is not a string', () => {
    const token = tokenWithPayload({ sub: 'subject-1', exp: 1, email: 42 });

    expect(readTokenClaims(token)?.email).toBeNull();
  });
});
