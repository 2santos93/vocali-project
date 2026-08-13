import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from '@vocali/contracts';
import type { TranscriptionLanguage } from '@vocali/contracts';
import type { SelectOption } from './types';

/**
 * The Spanish name of every language the platform transcribes, and the select
 * options built from it.
 *
 * Both panels offer this choice, and two copies of the list is how one of them
 * ends up offering a language the other does not. The map is keyed by the
 * contract's union, so a language added to the platform stops this compiling
 * until someone has written the word a clinician will read — a plain
 * `Record<string, string>` would silently render the code instead.
 *
 * Beside `types.ts` rather than inside `organisms/`, which holds components:
 * this is a list and a narrowing function, shared by two of them.
 */
const LANGUAGE_LABELS: Record<TranscriptionLanguage, string> = {
  es: 'Español',
  en: 'Inglés',
  ca: 'Catalán',
  eu: 'Euskera',
  gl: 'Gallego',
};

export const TRANSCRIPTION_LANGUAGE_OPTIONS: readonly SelectOption[] =
  SUPPORTED_TRANSCRIPTION_LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }));

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
