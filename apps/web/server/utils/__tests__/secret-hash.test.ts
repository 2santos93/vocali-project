/**
 * @jest-environment node
 */
import { createHmac } from 'node:crypto';
import { computeSecretHash } from '../secret-hash';

describe('the confidential client secret hash', () => {
  it('is the base64 HMAC-SHA256 of the username followed by the client id', () => {
    const expected = createHmac('sha256', 'the-client-secret')
      .update('ana@example.com1a2b3c')
      .digest('base64');

    expect(computeSecretHash('ana@example.com', '1a2b3c', 'the-client-secret')).toBe(expected);
  });

  it('is not symmetric in its two operands', () => {
    expect(computeSecretHash('ana@example.com', '1a2b3c', 'secret')).not.toBe(
      computeSecretHash('1a2b3c', 'ana@example.com', 'secret'),
    );
  });

  it('changes with the secret', () => {
    expect(computeSecretHash('ana@example.com', '1a2b3c', 'one')).not.toBe(
      computeSecretHash('ana@example.com', '1a2b3c', 'two'),
    );
  });
});
