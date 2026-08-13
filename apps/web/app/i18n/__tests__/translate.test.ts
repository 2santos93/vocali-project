import { MissingMessageError, createInterfaceI18n, translate } from '../translate';
import type { MessageKey, MessageSchema } from '../types';

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

  it('refuses to render a placeholder it was given no value for', () => {
    expect(() => translate('es', 'history.page')).toThrow(MissingMessageError);
    expect(() => translate('es', 'upload.rejected.empty', { size: '1 MB' })).toThrow(
      'The message "upload.rejected.empty" needs a value for "{fileName}" and was given none.',
    );
  });

  it('leaves a message with no placeholders alone when given values anyway', () => {
    expect(translate('es', 'history.retry', { number: 3 })).toBe('Reintentar');
  });

  it('never fills a gap in one language with another language sentence', () => {
    const i18n = createInterfaceI18n('en');

    i18n.global.setLocaleMessage('en', {} as MessageSchema);

    expect(() => i18n.global.t('history.retry')).toThrow(MissingMessageError);
    expect(() => i18n.global.t('history.retry')).not.toThrow('Reintentar');
  });
});
