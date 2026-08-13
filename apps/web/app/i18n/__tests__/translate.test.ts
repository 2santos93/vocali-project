import { MissingMessageError, createInterfaceI18n, translate } from '../translate';
import type { MessageKey } from '../types/MessageKey';
import type { MessageSchema } from '../types/MessageSchema';

/*
 * Real keys and real sentences throughout. Asserting that `translate` returns
 * `SPANISH_MESSAGES[key]` would pass against an empty catalogue, a catalogue in
 * the wrong language, and a catalogue where every entry is the same string —
 * so every expectation below is a literal somebody can read.
 */

describe('translate', () => {
  it('renders the Spanish message for a key', () => {
    expect(translate('es', 'history.retry')).toBe('Reintentar');
    expect(translate('es', 'status.COMPLETED')).toBe('Completada');
  });

  it('renders the English message for the same key', () => {
    expect(translate('en', 'history.retry')).toBe('Try again');
    expect(translate('en', 'status.COMPLETED')).toBe('Completed');
  });

  it('fills a placeholder with the value it is given', () => {
    expect(translate('es', 'history.page', { number: 3 })).toBe('Página 3');
    expect(translate('en', 'history.page', { number: 3 })).toBe('Page 3');
  });

  it('fills every occurrence and every placeholder of a message', () => {
    expect(
      translate('es', 'upload.rejected.tooLarge', {
        fileName: 'consulta.wav',
        size: '24,3 MB',
        maxSize: '20 MB',
      }),
    ).toBe('«consulta.wav» ocupa 24,3 MB y el límite es 20 MB.');
  });

  /*
   * The loud half of this module, and the reason it exists rather than a
   * three-line lookup.
   *
   * A missing key normally cannot be written — `MessageKey` is the union of the
   * Spanish catalogue's own keys — so this reaches it the only way production
   * can: a key assembled at run time from a value that crossed a boundary. An
   * authentication failure code does exactly that.
   *
   * The alternatives are what every i18n library does by default. Rendering the
   * key puts `history.column.date` in front of a clinician; rendering an empty
   * string puts a column with no heading there. Both look like a small visual
   * defect, neither leads anybody to the missing entry, and both would pass
   * this suite silently.
   */
  it('refuses to render a key it has no message for, in either language', () => {
    const absent = 'history.column.invented' as MessageKey;

    expect(() => translate('es', absent)).toThrow(MissingMessageError);
    expect(() => translate('en', absent)).toThrow(MissingMessageError);
  });

  it('names the key and the language it could not find, so the report is actionable', () => {
    expect(() => translate('en', 'nothing.here' as MessageKey)).toThrow(
      'No en message for "nothing.here".',
    );
  });

  /*
   * The likelier of the two mistakes, because a key is checked by the compiler
   * and a value is not. `«{fileName}» está vacío` is a sentence that reached a
   * user and told them nothing.
   */
  it('refuses to render a placeholder it was given no value for', () => {
    expect(() => translate('es', 'history.page')).toThrow(MissingMessageError);
    expect(() => translate('es', 'upload.rejected.empty', { size: '1 MB' })).toThrow(
      'The message "upload.rejected.empty" needs a value for "{fileName}" and was given none.',
    );
  });

  it('leaves a message with no placeholders alone when given values anyway', () => {
    expect(translate('es', 'history.retry', { number: 3 })).toBe('Reintentar');
  });

  /*
   * A gap filled from another language is the worst of the three behaviours:
   * the screen looks translated, reads correctly to nobody, and reports
   * nothing. The typed schema means a gap cannot exist in these catalogues, so
   * this drives one in deliberately — the only way to find out what the
   * instance would do if one ever did.
   *
   * What this pins is the outcome, not the `fallbackLocale: false` line.
   * `vue-i18n` consults the `missing` handler once per locale it tries, so the
   * throw pre-empts the fallback: setting `fallbackLocale: 'es'` leaves this
   * test passing. Reverting the handler is what makes it fail — which is the
   * behaviour worth pinning, and the one a reader would notice.
   */
  it('never fills a gap in one language with another language sentence', () => {
    const i18n = createInterfaceI18n('en');

    i18n.global.setLocaleMessage('en', {} as MessageSchema);

    expect(() => i18n.global.t('history.retry')).toThrow(MissingMessageError);
    expect(() => i18n.global.t('history.retry')).not.toThrow('Reintentar');
  });
});
