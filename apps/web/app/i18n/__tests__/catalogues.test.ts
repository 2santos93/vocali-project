import { ENGLISH_MESSAGES } from '../en';
import { SPANISH_MESSAGES } from '../es';
import type { MessageKey } from '../types';

const KEYS = Object.keys(SPANISH_MESSAGES) as MessageKey[];

function placeholdersOf(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('the message catalogues', () => {
  it('carry the same keys, in both directions', () => {
    expect(Object.keys(ENGLISH_MESSAGES).sort()).toEqual(KEYS.slice().sort());
  });

  it.each(['es', 'en'] as const)('has no empty message in %s', (language) => {
    const catalogue = language === 'es' ? SPANISH_MESSAGES : ENGLISH_MESSAGES;
    const blank = KEYS.filter((key) => catalogue[key].trim() === '');

    expect(blank).toEqual([]);
  });

  it('interpolates the same values in both languages', () => {
    const mismatched = KEYS.filter(
      (key) =>
        placeholdersOf(SPANISH_MESSAGES[key]).join(',') !==
        placeholdersOf(ENGLISH_MESSAGES[key]).join(','),
    );

    expect(mismatched).toEqual([]);
  });

  const IDENTICAL_ON_PURPOSE: MessageKey[] = [
    // Each language names itself, so that the reader who cannot read the
    // current interface can still find their own.
    'preferences.language.es',
    'preferences.language.en',
    // Six digits. There is nothing to translate.
    'auth.confirm.codePlaceholder',
  ];

  it('says something different in English, except where sameness is the point', () => {
    const identical = KEYS.filter((key) => SPANISH_MESSAGES[key] === ENGLISH_MESSAGES[key]).filter(
      (key) => !IDENTICAL_ON_PURPOSE.includes(key),
    );

    expect(identical).toEqual([]);
  });

  it('translates the audio languages while naming the interface ones in their own', () => {
    // The language of a recording is described to the reader, so it moves.
    expect(SPANISH_MESSAGES['audioLanguage.ca']).toBe('Catalán');
    expect(ENGLISH_MESSAGES['audioLanguage.ca']).toBe('Catalan');

    // The interface language names itself, so it does not.
    expect(SPANISH_MESSAGES['preferences.language.es']).toBe('Español');
    expect(ENGLISH_MESSAGES['preferences.language.es']).toBe('Español');
  });
});
