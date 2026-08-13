import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from '@vocali/contracts';
import type { TranscriptionLanguage } from '@vocali/contracts';
import type { MessageKey } from '../i18n/translate';
import type { Translate } from '../i18n/translations';
import type { SelectOption } from './component-vocabulary';

/**
 * The name of every language the platform **transcribes**, and the select
 * options built from it.
 *
 * This list is about audio. It has nothing to do with the language the
 * interface is written in, and the two must never be wired together: a
 * clinician reading these screens in English dictates in Catalan, and a
 * product that inferred one from the other would force them to give up one of
 * the two. The names are translated — a reader in English sees "Catalan" and a
 * reader in Spanish sees "Catalán" — but the *choice* remains theirs and
 * remains per dictation.
 *
 * The dictation screen offers this as a choice, because a live session has no
 * audio to identify yet. The upload screen only ever *reports* one, because
 * the provider identifies it from the file. The map is keyed by the contract's
 * union, so a language added to the platform stops this compiling until
 * someone has written the word a clinician will read, in every catalogue — a
 * plain `Record<string, string>` would silently render the code.
 *
 * Beside `types.ts` rather than inside `organisms/`, which holds components:
 * this is a list and two small functions, shared by both of them.
 */
const AUDIO_LANGUAGE_KEYS: Record<TranscriptionLanguage, MessageKey> = {
  es: 'audioLanguage.es',
  en: 'audioLanguage.en',
  ca: 'audioLanguage.ca',
  eu: 'audioLanguage.eu',
  gl: 'audioLanguage.gl',
};

/**
 * A function rather than a constant, and called from a `computed` at each use
 * site: the labels have to be rebuilt when the reader changes language, and a
 * module-level array is built once when the module is first imported.
 */
export function transcriptionLanguageOptions(t: Translate): readonly SelectOption[] {
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.map((code) => ({
    value: code,
    label: t(AUDIO_LANGUAGE_KEYS[code]),
  }));
}

/**
 * The name of one language, for a screen that reports rather than asks.
 *
 * Same map as the options above, so the word a reader is shown for a detected
 * Catalan file is the same word the dictation screen offers them.
 */
export function transcriptionLanguageName(t: Translate, code: TranscriptionLanguage): string {
  return t(AUDIO_LANGUAGE_KEYS[code]);
}

/**
 * Narrows what a select reports back to the contract's union.
 *
 * `BaseSelect` speaks in strings because that is what a DOM select emits.
 * Asserting the value into `TranscriptionLanguage` would let a stale option in
 * an already-rendered page put a language the API rejects into a request, so
 * the value is searched for instead and an unknown one yields null.
 */
export function toTranscriptionLanguage(value: string): TranscriptionLanguage | null {
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.find((code) => code === value) ?? null;
}
