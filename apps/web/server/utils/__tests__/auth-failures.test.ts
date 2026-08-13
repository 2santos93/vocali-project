/**
 * @jest-environment node
 */
import {
  describeConfirmationFailure,
  describeRefreshFailure,
  describeRegistrationFailure,
  describeResendFailure,
  describeSignInFailure,
  describeSignOutFailure,
  INVALID_INPUT,
  SESSION_EXPIRED,
  type AuthFailure,
} from '../auth-failures';

/** The AWS SDK identifies a modelled exception by `name`, and nothing else. */
function cognitoError(name: string): Error {
  const error = new Error('Cognito said something in English about internals');
  error.name = name;

  return error;
}

type Describer = (error: unknown) => AuthFailure | null;

const EVERY_DESCRIBER: readonly (readonly [string, Describer])[] = [
  ['registration', describeRegistrationFailure],
  ['confirmation', describeConfirmationFailure],
  ['resend', describeResendFailure],
  ['sign-in', describeSignInFailure],
  ['sign-out', describeSignOutFailure],
];

describe('no provider vocabulary reaches the browser', () => {
  it.each(EVERY_DESCRIBER)(
    '%s hides the Cognito exception name and message',
    (_name, describe_) => {
      const failure = describe_(cognitoError('SomeUnmappedCognitoException'));

      if (failure === null) return;

      expect(failure.message).not.toMatch(/Exception/);
      expect(failure.message).not.toMatch(/Cognito/i);
      expect(failure.code).not.toMatch(/Exception/);
    },
  );

  it.each(EVERY_DESCRIBER)('%s survives a rejection that is not an Error', (_name, describe_) => {
    // A rejected promise is not obliged to carry an Error, and reading `.name`
    // off a string or null must not become a 500 of its own.
    expect(() => describe_('a string')).not.toThrow();
    expect(() => describe_(null)).not.toThrow();
    expect(() => describe_({ name: 42 })).not.toThrow();
  });
});

describe('registration does not enumerate users', () => {
  /*
   * A visitor typing an address into the sign-up form must not learn from the
   * answer whether it already has an account. `null` means "answer as though
   * it had succeeded", so the route's reply is identical in both cases.
   */
  it('reports an address that already has an account as a success', () => {
    expect(describeRegistrationFailure(cognitoError('UsernameExistsException'))).toBeNull();
  });

  it('reports a weak password, which is public policy and not about the user', () => {
    const failure = describeRegistrationFailure(cognitoError('InvalidPasswordException'));

    expect(failure?.code).toBe('WEAK_PASSWORD');
    expect(failure?.statusCode).toBe(400);
    expect(failure?.message).toMatch(/8 caracteres/);
  });

  it('reports rate limiting so the user knows to wait rather than to retype', () => {
    expect(describeRegistrationFailure(cognitoError('TooManyRequestsException'))?.code).toBe(
      'RATE_LIMITED',
    );
    expect(describeRegistrationFailure(cognitoError('LimitExceededException'))?.code).toBe(
      'RATE_LIMITED',
    );
  });

  it('reports a malformed submission and a delivery failure distinctly', () => {
    expect(describeRegistrationFailure(cognitoError('InvalidParameterException'))?.code).toBe(
      'INVALID_REGISTRATION',
    );
    expect(describeRegistrationFailure(cognitoError('CodeDeliveryFailureException'))?.code).toBe(
      'CODE_DELIVERY_FAILED',
    );
  });

  it('falls back to an unavailability message rather than to silence', () => {
    const failure = describeRegistrationFailure(cognitoError('InternalErrorException'));

    expect(failure?.code).toBe('AUTH_UNAVAILABLE');
    expect(failure?.statusCode).toBe(502);
  });
});

describe('resending does not enumerate users', () => {
  it.each(['UserNotFoundException', 'InvalidParameterException', 'NotAuthorizedException'])(
    'answers as a success for %s',
    (name) => {
      // Unknown address, already confirmed, and code genuinely sent all have to
      // look the same, or the resend control becomes the enumeration endpoint
      // the sign-up form deliberately is not.
      expect(describeResendFailure(cognitoError(name))).toBeNull();
    },
  );

  it('still reports rate limiting, which says nothing about the address', () => {
    expect(describeResendFailure(cognitoError('LimitExceededException'))?.code).toBe(
      'RATE_LIMITED',
    );
    expect(describeResendFailure(cognitoError('TooManyRequestsException'))?.code).toBe(
      'RATE_LIMITED',
    );
    expect(describeResendFailure(cognitoError('CodeDeliveryFailureException'))?.code).toBe(
      'CODE_DELIVERY_FAILED',
    );
  });
});

describe('signing in does not distinguish a wrong password from an unknown address', () => {
  it('gives an unknown address and a wrong password the identical failure', () => {
    const unknownAddress = describeSignInFailure(cognitoError('UserNotFoundException'));
    const wrongPassword = describeSignInFailure(cognitoError('NotAuthorizedException'));

    expect(unknownAddress).toStrictEqual(wrongPassword);
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.code).toBe('INVALID_CREDENTIALS');
  });

  it('folds a malformed parameter into the same failure', () => {
    expect(describeSignInFailure(cognitoError('InvalidParameterException')).code).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('sends an unconfirmed account to the confirmation screen instead of a dead end', () => {
    const failure = describeSignInFailure(cognitoError('UserNotConfirmedException'));

    expect(failure.code).toBe('ACCOUNT_NOT_CONFIRMED');
    expect(failure.statusCode).toBe(403);
    expect(failure.message).toMatch(/código/);
  });

  it('names a required password reset, which is otherwise an unexplained refusal', () => {
    expect(describeSignInFailure(cognitoError('PasswordResetRequiredException')).code).toBe(
      'PASSWORD_RESET_REQUIRED',
    );
  });

  it('reports rate limiting and falls back to unavailability', () => {
    expect(describeSignInFailure(cognitoError('TooManyRequestsException')).code).toBe(
      'RATE_LIMITED',
    );
    expect(describeSignInFailure(cognitoError('LimitExceededException')).code).toBe('RATE_LIMITED');
    expect(describeSignInFailure(cognitoError('InternalErrorException')).code).toBe(
      'AUTH_UNAVAILABLE',
    );
  });
});

describe('confirming an address', () => {
  it('names an expired code, because the way out of it is a different button', () => {
    const failure = describeConfirmationFailure(cognitoError('ExpiredCodeException'));

    expect(failure.code).toBe('CODE_EXPIRED');
    expect(failure.message).toMatch(/caducado/);
    expect(failure.message).toMatch(/nuevo/);
  });

  it.each([
    'CodeMismatchException',
    'UserNotFoundException',
    'NotAuthorizedException',
    'AliasExistsException',
  ])('gives %s one indistinguishable failure', (name) => {
    // A wrong code, an address with no account, and an account that is already
    // confirmed must read identically, or a stranger learns which of the three
    // they are looking at.
    expect(describeConfirmationFailure(cognitoError(name))).toStrictEqual(
      describeConfirmationFailure(cognitoError('CodeMismatchException')),
    );
  });

  it('tells the user both ways forward in that one message', () => {
    const failure = describeConfirmationFailure(cognitoError('CodeMismatchException'));

    expect(failure.code).toBe('CODE_REJECTED');
    expect(failure.message).toMatch(/nuevo/);
    expect(failure.message).toMatch(/inicia sesión/i);
  });

  it('reports too many failed attempts as rate limiting', () => {
    expect(describeConfirmationFailure(cognitoError('TooManyFailedAttemptsException')).code).toBe(
      'RATE_LIMITED',
    );
    expect(describeConfirmationFailure(cognitoError('TooManyRequestsException')).code).toBe(
      'RATE_LIMITED',
    );
    expect(describeConfirmationFailure(cognitoError('LimitExceededException')).code).toBe(
      'RATE_LIMITED',
    );
    expect(describeConfirmationFailure(cognitoError('InternalErrorException')).code).toBe(
      'AUTH_UNAVAILABLE',
    );
  });
});

describe('signing out', () => {
  it('treats an already-invalid token as a completed sign-out', () => {
    // There is no live session left to end, so reporting a failure would teach
    // users that signing out is unreliable.
    expect(describeSignOutFailure(cognitoError('NotAuthorizedException'))).toBeNull();
    expect(describeSignOutFailure(cognitoError('UserNotFoundException'))).toBeNull();
  });

  it('reports honestly when Cognito could not be reached', () => {
    const failure = describeSignOutFailure(cognitoError('TimeoutError'));

    // The refresh token is still live wherever a copy exists. Saying so is the
    // difference between this and a sign-out that only drops a cookie.
    expect(failure?.code).toBe('SIGN_OUT_INCOMPLETE');
    expect(failure?.statusCode).toBe(502);
    expect(failure?.message).toMatch(/demás/);
  });
});

describe('refreshing', () => {
  it('always reports the session as over', () => {
    expect(describeRefreshFailure()).toStrictEqual(SESSION_EXPIRED);
    expect(SESSION_EXPIRED.statusCode).toBe(401);
  });
});

describe('malformed input', () => {
  it('is a 400 with a message that says where to look', () => {
    expect(INVALID_INPUT.statusCode).toBe(400);
    expect(INVALID_INPUT.message).toMatch(/formulario/);
  });
});
