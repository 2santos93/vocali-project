import { SUPPORTED_TRANSCRIPTION_LANGUAGES } from '@vocali/contracts';
import type { TranscriptionLanguage } from '@vocali/contracts';
import type { MessageKey, Translate } from '../i18n/types';
import type { SelectOption } from './types/controls';

const AUDIO_LANGUAGE_KEYS: Record<TranscriptionLanguage, MessageKey> = {
  es: 'audioLanguage.es',
  en: 'audioLanguage.en',
  ca: 'audioLanguage.ca',
  eu: 'audioLanguage.eu',
  gl: 'audioLanguage.gl',
};

export function transcriptionLanguageOptions(t: Translate): readonly SelectOption[] {
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.map((code) => ({
    value: code,
    label: t(AUDIO_LANGUAGE_KEYS[code]),
  }));
}

export function transcriptionLanguageName(t: Translate, code: TranscriptionLanguage): string {
  return t(AUDIO_LANGUAGE_KEYS[code]);
}

export function toTranscriptionLanguage(value: string): TranscriptionLanguage | null {
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.find((code) => code === value) ?? null;
}
