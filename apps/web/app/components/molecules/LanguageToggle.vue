<script setup lang="ts">
import { INTERFACE_LANGUAGES } from '../../i18n/language';
import type { InterfaceLanguage } from '../../i18n/language';
import { useTranslations } from '../../i18n/translations';
import type { MessageKey } from '../../i18n/translate';

/**
 * Choosing the language the **interface** is written in.
 *
 * Not the language of a recording. That one is chosen per dictation, on the
 * screen that starts it, and is sent to the transcription service; this one
 * never leaves the browser and the two must never be wired to each other — a
 * clinician who reads this application in English still dictates in Catalan.
 *
 * Presentational, like every other component here: the current language
 * arrives as a prop and the chosen one leaves as an event.
 */

interface Props {
  language: InterfaceLanguage;
  id?: string;
}

withDefaults(defineProps<Props>(), { id: 'interface-language' });

const emit = defineEmits<{ 'update:language': [language: InterfaceLanguage] }>();

const { t } = useTranslations();

/*
 * Keyed by the union, so a language added to the application stops this
 * compiling until it has a name in the control that switches to it.
 *
 * Each option is named in its own language in both catalogues, which is the
 * only way it helps the person it exists for: somebody looking at an interface
 * they cannot read is looking for the word they *can*.
 */
const OPTION_KEYS: Record<InterfaceLanguage, MessageKey> = {
  es: 'preferences.language.es',
  en: 'preferences.language.en',
};

function onChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  const chosen = INTERFACE_LANGUAGES.find((language) => language === value);

  if (chosen !== undefined) {
    emit('update:language', chosen);
  }
}
</script>

<template>
  <div class="flex items-center gap-2">
    <label :for="id" class="text-xs font-medium text-ink-muted">{{
      t('preferences.language')
    }}</label>
    <select
      :id="id"
      :value="language"
      class="rounded-control border border-line bg-surface px-2 py-1 text-sm text-ink transition-colors focus-visible:focus-ring"
      data-testid="language-toggle"
      @change="onChange"
    >
      <option v-for="option in INTERFACE_LANGUAGES" :key="option" :value="option">
        {{ t(OPTION_KEYS[option]) }}
      </option>
    </select>
  </div>
</template>
