import { CryptoTokenGenerator } from '../crypto-token-generator.js';

describe('CryptoTokenGenerator', () => {
  it('never repeats a token', () => {
    const generator = new CryptoTokenGenerator();

    const tokens = new Set(Array.from({ length: 1_000 }, () => generator.generate()));

    expect(tokens.size).toBe(1_000);
  });

  it('is URL-safe, because the token travels in a query string', () => {
    const generator = new CryptoTokenGenerator();

    for (const token of Array.from({ length: 100 }, () => generator.generate())) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('carries the full 256 bits, so guessing is not the attack anyone tries', () => {
    // 32 bytes in base64url is 43 characters with no padding.
    expect(new CryptoTokenGenerator().generate()).toHaveLength(43);
  });
});
