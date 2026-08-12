/**
 * @jest-environment node
 */
import { confirmationSchema, credentialsSchema, parseRequest, resendSchema } from './auth-requests';

describe('credentials', () => {
  it('accepts an address and a password', () => {
    expect(
      parseRequest(credentialsSchema, { email: 'ana@example.com', password: 'Abcd1234!' }),
    ).toStrictEqual({ email: 'ana@example.com', password: 'Abcd1234!' });
  });

  it('trims the address, so a copied-and-pasted space is not a failed sign-in', () => {
    expect(
      parseRequest(credentialsSchema, { email: '  ana@example.com ', password: 'x' })?.email,
    ).toBe('ana@example.com');
  });

  it.each([
    ['a body that is not an object', 'ana@example.com'],
    ['a missing address', { password: 'x' }],
    ['a missing password', { email: 'ana@example.com' }],
    ['an empty password', { email: 'ana@example.com', password: '' }],
    ['an address with no @', { email: 'ana.example.com', password: 'x' }],
    ['an address with no domain dot', { email: 'ana@example', password: 'x' }],
    ['an address with a space', { email: 'an a@example.com', password: 'x' }],
    ['a non-string password', { email: 'ana@example.com', password: 12345678 }],
    ['a null body', null],
  ])('rejects %s', (_name, body) => {
    // A body is the definition of a value crossing a trust boundary. Casting
    // it would put `undefined.trim()` inside a Cognito call whose failure is
    // reported to the user as "vuelve a intentarlo en unos minutos".
    expect(parseRequest(credentialsSchema, body)).toBeNull();
  });

  it('does not restate the password policy the user pool enforces', () => {
    // Two places to change is one place to forget, and a client rule stricter
    // than the server's silently forbids passwords the account could have had.
    expect(
      parseRequest(credentialsSchema, { email: 'ana@example.com', password: 'a' }),
    ).not.toBeNull();
  });
});

describe('confirmation', () => {
  it('accepts an address and a code', () => {
    expect(
      parseRequest(confirmationSchema, { email: 'ana@example.com', code: ' 123456 ' }),
    ).toStrictEqual({ email: 'ana@example.com', code: '123456' });
  });

  it.each([
    ['a missing code', { email: 'ana@example.com' }],
    ['an empty code', { email: 'ana@example.com', code: '   ' }],
    ['a code longer than any Cognito sends', { email: 'ana@example.com', code: '1'.repeat(17) }],
  ])('rejects %s', (_name, body) => {
    expect(parseRequest(confirmationSchema, body)).toBeNull();
  });
});

describe('resend', () => {
  it('accepts an address on its own', () => {
    expect(parseRequest(resendSchema, { email: 'ana@example.com' })).toStrictEqual({
      email: 'ana@example.com',
    });
  });

  it('rejects a body with no address', () => {
    expect(parseRequest(resendSchema, {})).toBeNull();
  });
});
