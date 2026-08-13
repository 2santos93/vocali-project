import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from '@vocali/contracts';
import type { TranscriptionLanguage } from '@vocali/contracts';
import type { MessageKey, Translate } from '../i18n/types';
import type { SelectOption } from './types/controls';

/**
 * The languages the platform **transcribes**. Nothing to do with the language
 * the interface is written in, and the two must never be wired together: a
 * clinician reading these screens in English dictates in Catalan.
 *
 * Keyed by the contract's union, so a language added to the platform stops
 * this compiling until someone has written the word a clinician will read.
 */
const AUDIO_LANGUAGE_KEYS: Record<TranscriptionLanguage, MessageKey> = {
  es: 'audioLanguage.es',
  en: 'audioLanguage.en',
  ca: 'audioLanguage.ca',
  eu: 'audioLanguage.eu',
  gl: 'audioLanguage.gl',
};

/**
 * A function rather than a constant, called from a `computed` at each use
 * site: a module-level array is built once at import and would not follow the
 * reader changing language.
 */
export function transcriptionLanguageOptions(t: Translate): readonly SelectOption[] {
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.map((code) => ({
    value: code,
    label: t(AUDIO_LANGUAGE_KEYS[code]),
  }));
}

export function transcriptionLanguageName(t: Translate, code: TranscriptionLanguage): string {
  return t(AUDIO_LANGUAGE_KEYS[code]);
}

/**
 * Searched rather than asserted: casting a DOM select's string into
 * `TranscriptionLanguage` would let a stale option in an already-rendered page
 * put a language the API rejects into a request.
 */
export function toTranscriptionLanguage(value: string): TranscriptionLanguage | null {
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.find((code) => code === value) ?? null;
}
