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

export function describeRefreshFailure(): AuthFailure {
  return SESSION_EXPIRED;
}

function readErrorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;

  const name: unknown = (error as { name?: unknown }).name;

  return typeof name === 'string' ? name : null;
}
