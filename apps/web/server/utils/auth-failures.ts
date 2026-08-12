/**
 * Cognito failures translated into something a user can act on.
 *
 * Two rules govern every line below.
 *
 * **No provider code reaches the browser.** `UsernameExistsException` is
 * Cognito's vocabulary, not the user's, and shipping it to the page leaks the
 * identity provider along with it. What crosses the boundary is a stable
 * application code — for the interface to branch on — and a Spanish sentence
 * that says what to do next. "Contraseña incorrecta" without a next step is
 * only marginally better than the raw code.
 *
 * **An error must not answer a question the caller has not earned.** An
 * anonymous visitor who types an address into the registration form must not
 * learn from the response whether that address already has an account: the
 * membership list of a medical transcription service is itself sensitive, and
 * a sign-up form that says "ya está registrado" is a user enumeration
 * endpoint with a friendly face. The user pool is configured with
 * `prevent_user_existence_errors`, which covers sign-in, but Cognito's
 * `SignUp` reveals existence regardless — so it is neutralised here.
 *
 * Where the two rules leave a residue, it is named in a comment rather than
 * papered over.
 */

export interface AuthFailure {
  readonly statusCode: number;
  /** Stable, ours, and safe to branch on in the interface. */
  readonly code: string;
  /** Spanish, and always says what to do next. */
  readonly message: string;
}

const RATE_LIMITED: AuthFailure = {
  statusCode: 429,
  code: 'RATE_LIMITED',
  message: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
};

const UNAVAILABLE: AuthFailure = {
  statusCode: 502,
  code: 'AUTH_UNAVAILABLE',
  message: 'No hemos podido completar la operación. Vuelve a intentarlo en unos minutos.',
};

const INVALID_CREDENTIALS: AuthFailure = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message:
    'El correo electrónico o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
};

const ACCOUNT_NOT_CONFIRMED: AuthFailure = {
  statusCode: 403,
  code: 'ACCOUNT_NOT_CONFIRMED',
  message:
    'Tu cuenta todavía no está confirmada. Introduce el código que te enviamos por correo o pide uno nuevo.',
};

const WEAK_PASSWORD: AuthFailure = {
  statusCode: 400,
  code: 'WEAK_PASSWORD',
  message:
    'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y símbolos.',
};

const INVALID_REGISTRATION: AuthFailure = {
  statusCode: 400,
  code: 'INVALID_REGISTRATION',
  message: 'Revisa el correo electrónico y la contraseña, y vuelve a enviar el formulario.',
};

const CODE_DELIVERY_FAILED: AuthFailure = {
  statusCode: 502,
  code: 'CODE_DELIVERY_FAILED',
  message: 'No hemos podido enviar el código a esa dirección. Comprueba que sea correcta.',
};

const CODE_EXPIRED: AuthFailure = {
  statusCode: 400,
  code: 'CODE_EXPIRED',
  message: 'El código ha caducado. Pide uno nuevo y vuelve a introducirlo.',
};

const CODE_REJECTED: AuthFailure = {
  statusCode: 400,
  code: 'CODE_REJECTED',
  message:
    'El código no es correcto o ya no se puede usar. Pide uno nuevo, o inicia sesión si ya confirmaste tu cuenta.',
};

const SESSION_EXPIRED: AuthFailure = {
  statusCode: 401,
  code: 'SESSION_EXPIRED',
  message: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
};

export const INVALID_INPUT: AuthFailure = {
  statusCode: 400,
  code: 'INVALID_INPUT',
  message: 'Faltan datos o no tienen el formato esperado. Revisa el formulario.',
};

export { SESSION_EXPIRED };

/**
 * Registration.
 *
 * `null` means "answer as though it had succeeded". `UsernameExistsException`
 * is the one Cognito outcome this application refuses to report: the response
 * to registering an address that already has an account is byte for byte the
 * response to registering a new one, and both send the visitor to the
 * confirmation screen. Somebody who already has a confirmed account and
 * registers again gets a code they cannot use and a message telling them to
 * sign in, which costs a confirmed user one wasted screen and costs an
 * attacker the entire enumeration.
 */
export function describeRegistrationFailure(error: unknown): AuthFailure | null {
  switch (readErrorName(error)) {
    case 'UsernameExistsException':
      return null;
    case 'InvalidPasswordException':
      return WEAK_PASSWORD;
    case 'InvalidParameterException':
      return INVALID_REGISTRATION;
    case 'CodeDeliveryFailureException':
      return CODE_DELIVERY_FAILED;
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return RATE_LIMITED;
    default:
      return UNAVAILABLE;
  }
}

/**
 * Confirming an address.
 *
 * Everything except an expired code collapses into one message, so a wrong
 * code, an unknown address and an already-confirmed account are
 * indistinguishable. Expiry is kept separate because the brief requires the
 * expired path to be walkable and because "el código ha caducado, pide uno
 * nuevo" is the only wording that makes the resend control obviously the
 * right thing to press.
 *
 * That distinction is a stated residue: Cognito returns `ExpiredCodeException`
 * only for an address that exists and is still unconfirmed, so a caller who
 * sees it learns that much. The exposure is limited to accounts that never
 * finished signing up, and it is bounded by the same rate limiting as every
 * other call. Both alternatives were worse — folding expiry into the generic
 * message leaves a user re-entering a code that can never work, and Cognito
 * offers no way to make the two cases identical while still allowing a resend.
 */
export function describeConfirmationFailure(error: unknown): AuthFailure {
  switch (readErrorName(error)) {
    case 'ExpiredCodeException':
      return CODE_EXPIRED;
    case 'CodeMismatchException':
    case 'UserNotFoundException':
    case 'NotAuthorizedException':
    case 'AliasExistsException':
      return CODE_REJECTED;
    case 'TooManyFailedAttemptsException':
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return RATE_LIMITED;
    default:
      return UNAVAILABLE;
  }
}

/**
 * Resending a code.
 *
 * `null` again means "answer as though it had succeeded", and here it covers
 * every outcome that depends on whether the address exists. The route's reply
 * is the same sentence whatever happened, which is what stops the resend
 * control from becoming the enumeration endpoint the sign-up form is not.
 * Only rate limiting is reported, because a user hammering the button needs
 * to be told to stop and it says nothing about the address.
 */
export function describeResendFailure(error: unknown): AuthFailure | null {
  switch (readErrorName(error)) {
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return RATE_LIMITED;
    case 'CodeDeliveryFailureException':
      return CODE_DELIVERY_FAILED;
    default:
      return null;
  }
}

/**
 * Signing in.
 *
 * A wrong password and an address with no account produce the same 401 with
 * the same sentence. The user pool sets `prevent_user_existence_errors`, so
 * Cognito already answers `NotAuthorizedException` for an unknown address, but
 * mapping `UserNotFoundException` to the identical failure means the property
 * does not depend on that setting staying switched on.
 *
 * `UserNotConfirmedException` is the exception, and it is deliberate. A user
 * who registered, closed the tab and came back has no route forward from
 * "credenciales incorrectas"; they need to be sent to the confirmation screen.
 * Cognito raises it before checking the password, so it does reveal that an
 * unconfirmed account exists at that address — the same residue the
 * confirmation flow carries, accepted for the same reason, and no wider.
 */
export function describeSignInFailure(error: unknown): AuthFailure {
  switch (readErrorName(error)) {
    case 'UserNotConfirmedException':
      return ACCOUNT_NOT_CONFIRMED;
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
    case 'InvalidParameterException':
      return INVALID_CREDENTIALS;
    case 'PasswordResetRequiredException':
      return {
        statusCode: 403,
        code: 'PASSWORD_RESET_REQUIRED',
        message: 'Tienes que restablecer la contraseña antes de volver a entrar.',
      };
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return RATE_LIMITED;
    default:
      return UNAVAILABLE;
  }
}

/**
 * Signing out everywhere.
 *
 * `null` means the sign-out is complete. Cognito answering
 * `NotAuthorizedException` to a `GlobalSignOut` means the access token it was
 * given is already invalid, so there is no live session left to end and
 * clearing the cookies finishes the job. Reporting that as a failure would
 * teach users that signing out is unreliable.
 *
 * Anything else is reported, and reported honestly. If Cognito could not be
 * reached, the refresh token stays valid for the rest of its eight hours in
 * whatever copy of it exists elsewhere, and the browser cookies having gone is
 * not the same thing as having signed out. Saying so is the difference between
 * this and the sign-out acceptance criterion A3 exists to catch.
 */
export function describeSignOutFailure(error: unknown): AuthFailure | null {
  switch (readErrorName(error)) {
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return null;
    default:
      return {
        statusCode: 502,
        code: 'SIGN_OUT_INCOMPLETE',
        message:
          'Hemos cerrado la sesión en este navegador, pero no hemos podido cerrarla en los demás. Vuelve a intentarlo en unos minutos.',
      };
  }
}

/**
 * Refreshing.
 *
 * Every failure is the same as far as the browser is concerned: the session is
 * over and the cookies are cleared. A revoked refresh token — which is exactly
 * what signing out everywhere produces — arrives here as
 * `NotAuthorizedException`, and it is not an error condition to report but the
 * expected end of a session.
 */
export function describeRefreshFailure(): AuthFailure {
  return SESSION_EXPIRED;
}

/**
 * The AWS SDK puts the modelled exception in `name`. Read defensively: a
 * network failure arriving here is an `Error` with an unrelated name, and a
 * rejected promise is not guaranteed to carry an `Error` at all.
 */
function readErrorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;

  const name: unknown = (error as { name?: unknown }).name;

  return typeof name === 'string' ? name : null;
}
