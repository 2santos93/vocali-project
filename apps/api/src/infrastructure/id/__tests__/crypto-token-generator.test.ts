import { CryptoTokenGenerator } from '../crypto-token-generator.js';

describe('CryptoTokenGenerator', () => {
  it('never repeats a token', () => {
    const generator = new CryptoTokenGenerator();

    const tokens = new Set(Array.from({ length: 1_000 }, () => generator.generate()));

    // A collision means two users issued the same ticket, and the second to
    // redeem it resolved as the first. Not a proof of randomness, but it fails
    // immediately against a counter, a timestamp or a constant.
    expect(tokens.size).toBe(1_000);
  });

  it('is URL-safe, because the token travels in a query string', () => {
    const generator = new CryptoTokenGenerator();

    for (const token of Array.from({ length: 100 }, () => generator.generate())) {
      // Standard base64 puts `+` and `/` in the value. One becomes a space and
      // the other a path separator once something decodes it, so a token
      // containing either is a connect that fails intermittently.
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('carries the full 256 bits, so guessing is not the attack anyone tries', () => {
    // 32 bytes in base64url is 43 characters with no padding.
    expect(new CryptoTokenGenerator().generate()).toHaveLength(43);
  });
});
