/**
 * Two rules govern every line below.
 *
 * **No provider code reaches the browser.** What crosses the boundary is a
 * stable application code for the interface to branch on, and a Spanish
 * sentence that says what to do next.
 *
 * **An error must not answer a question the caller has not earned.** A
 * visitor typing an address into the registration form must not learn whether
 * it already has an account: a sign-up form that says "ya está registrado" is
 * a user enumeration endpoint with a friendly face. The pool sets
 * `prevent_user_existence_errors`, which covers sign-in, but Cognito's
 * `SignUp` reveals existence regardless, so it is neutralised here.
 *
 * Where the rules leave a residue, it is named rather than papered over.
 */

/**
 * The interface carries a `Record<AuthFailureCode, MessageKey>`, so adding a
 * case here without words for it stops the front end compiling.
 */
export const AUTH_FAILURE_CODES = [
  'RATE_LIMITED',
  'AUTH_UNAVAILABLE',
  'INVALID_CREDENTIALS',
  'ACCOUNT_NOT_CONFIRMED',
  'WEAK_PASSWORD',
  'INVALID_REGISTRATION',
  'CODE_DELIVERY_FAILED',
  'CODE_EXPIRED',
  'CODE_REJECTED',
  'SESSION_EXPIRED',
  'INVALID_INPUT',
  'PASSWORD_RESET_REQUIRED',
  'SIGN_OUT_INCOMPLETE',
] as const;

export type AuthFailureCode = (typeof AUTH_FAILURE_CODES)[number];

export interface AuthFailure {
  readonly statusCode: number;
  /** Stable, ours, and safe to branch on in the interface. */
  readonly code: AuthFailureCode;
  /**
   * The HTTP contract: what a log records and what anything that is not this
   * browser reads. The browser renders the `code` through its own catalogue.
   */
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
 * `null` means "answer as though it had succeeded". The response to
 * registering an address that already has an account is byte for byte the
 * response to registering a new one, so `UsernameExistsException` is never
 * reported: it costs a confirmed user one wasted screen and an attacker the
 * entire enumeration.
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
 * Everything except an expired code collapses into one message, so a wrong
 * code, an unknown address and an already-confirmed account are
 * indistinguishable.
 *
 * Expiry is a stated residue: Cognito returns `ExpiredCodeException` only for
 * an address that exists and is still unconfirmed, so a caller who sees it
 * learns that much. Accepted because folding it into the generic message
 * leaves a user re-entering a code that can never work.
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
 * `null` covers every outcome that depends on whether the address exists,
 * which is what stops the resend control becoming the enumeration endpoint the
 * sign-up form is not. Rate limiting is reported because it says nothing about
 * the address.
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
 * A wrong password and an address with no account produce the same 401 with
 * the same sentence. Mapping `UserNotFoundException` to the identical failure
 * means the property does not depend on `prevent_user_existence_errors`
 * staying switched on.
 *
 * `UserNotConfirmedException` is the deliberate exception: a user who
 * registered and came back has no route forward from "credenciales
 * incorrectas". It reveals that an unconfirmed account exists — the same
 * residue the confirmation flow carries, and no wider.
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
 * `null` means the sign-out is complete: `NotAuthorizedException` on a
 * `GlobalSignOut` means the access token is already invalid, so there is no
 * live session left to end.
 *
 * Anything else is reported honestly. If Cognito could not be reached the
 * refresh token stays valid elsewhere for the rest of its eight hours, and
 * cleared browser cookies are not the same thing as having signed out.
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
 * Every failure is the same to the browser: the session is over and the
 * cookies are cleared. A revoked refresh token, which is what signing out
 * everywhere produces, is the expected end of a session rather than an error.
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
