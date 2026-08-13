import { translate } from '../i18n/translate';
import { authFailureMessage } from './auth-failure';

/**
 * The bridge between the code an authentication route answers with and the
 * sentence the reader is shown.
 *
 * Each expectation renders the message rather than comparing keys, because the
 * property that matters is that a refused sign-in reads as a refused sign-in —
 * in both languages, and without the reader's language ever being sent to the
 * server.
 */

describe('authFailureMessage', () => {
  it('says why the credentials were refused, in the language on screen', () => {
    const message = authFailureMessage('INVALID_CREDENTIALS', 'auth.signIn.failed');

    expect(translate('es', message.key)).toBe(
      'El correo electrónico o la contraseña no son correctos. Revísalos e inténtalo de nuevo.',
    );
    expect(translate('en', message.key)).toBe(
      'That email address or password is not correct. Check them and try again.',
    );
  });

  it('keeps an unconfirmed account apart from a wrong password', () => {
    const message = authFailureMessage('ACCOUNT_NOT_CONFIRMED', 'auth.signIn.failed');

    expect(translate('es', message.key)).toContain('todavía no está confirmada');
    expect(translate('en', message.key)).toContain('not confirmed yet');
  });

  it('reports rate limiting as something to wait out rather than to correct', () => {
    const message = authFailureMessage('RATE_LIMITED', 'auth.register.failed');

    expect(translate('es', message.key)).toBe(
      'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
    );
  });

  /*
   * The code has crossed HTTP, so it is whatever arrived. A request that never
   * reached the server carries none at all, and a server a version ahead of
   * this browser can carry one this catalogue has never heard of. Both fall
   * back to the screen's own sentence, which fits every case — rather than to a
   * blank alert, or to a thrown `MissingMessageError` on the one screen a user
   * meets when something has already gone wrong.
   */
  it.each([
    ['a failure that carried no code', null],
    ['a code from a newer server', 'MOON_PHASE_UNSUITABLE'],
    ['an empty code', ''],
  ])('falls back to the message the screen supplied, for %s', (_case, code) => {
    const message = authFailureMessage(code, 'auth.signIn.failed');

    expect(message).toEqual({ key: 'auth.signIn.failed' });
    expect(translate('es', message.key)).toBe(
      'No hemos podido iniciar sesión. Vuelve a intentarlo en unos minutos.',
    );
  });

  it('lets each screen choose its own fallback', () => {
    expect(authFailureMessage(null, 'auth.register.failed')).toEqual({
      key: 'auth.register.failed',
    });
    expect(authFailureMessage(null, 'auth.confirm.resendFailed')).toEqual({
      key: 'auth.confirm.resendFailed',
    });
  });
});
