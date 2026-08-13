<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { INTERFACE_LANGUAGES } from '../../i18n/language';
import type { InterfaceLanguage } from '../../i18n/types/InterfaceLanguage';
import { useTranslations } from '../../i18n/translations';
import type { MessageKey } from '../../i18n/types/MessageKey';
import FlagIcon from '../atoms/FlagIcon.vue';
import { useDropdown } from '../dropdown';

/**
 * The language the **interface** is written in, never the language of a
 * recording. That one is chosen per dictation and sent to the transcription
 * service; this one never leaves the browser, and the two must not be wired
 * together — a clinician reading in English still dictates in Catalan.
 *
 * A hand-built listbox rather than a `<select>` because a native select
 * always shows the selected option's own text, and closed this must be a flag
 * and a chevron to fit the header. The keyboard behaviour below is that cost.
 */
interface Props {
  language: InterfaceLanguage;
  id?: string;
}

const props = withDefaults(defineProps<Props>(), { id: 'interface-language' });

const emit = defineEmits<{ 'update:language': [language: InterfaceLanguage] }>();

const { t } = useTranslations();

/*
 * Each option is named in its own language in both catalogues: somebody
 * looking at an interface they cannot read is looking for the word they can.
 */
const OPTION_KEYS: Record<InterfaceLanguage, MessageKey> = {
  es: 'preferences.language.es',
  en: 'preferences.language.en',
};

/*
 * Destructured rather than kept as one object: a static `ref="container"` is
 * matched against a setup binding by name, and `ref="dropdown.container"`
 * would look for a binding with a dot in it and silently find nothing.
 */
const { open, container, trigger, toggle, show, dismiss } = useDropdown();

const listId = computed<string>(() => `${props.id}-list`);

function optionId(index: number): string {
  return `${props.id}-option-${String(index)}`;
}

const currentIndex = computed<number>(() =>
  INTERFACE_LANGUAGES.findIndex((language) => language === props.language),
);

/**
 * The row the keyboard is on, which is not the row that is chosen: committing
 * on every arrow key would redraw the whole application on the way past.
 */
const activeIndex = ref(0);

// Reset on open rather than left where the last visit ended, so the list does
// not reopen three rows away from the current language.
watch(open, (isOpen) => {
  if (isOpen) activeIndex.value = Math.max(currentIndex.value, 0);
});

const triggerLabel = computed<string>(() =>
  t('preferences.language.current', { language: t(OPTION_KEYS[props.language]) }),
);

function choose(language: InterfaceLanguage): void {
  // Returns focus to the button; the row holding it is about to stop existing,
  // and the focus would otherwise land on `<body>`.
  dismiss();

  // Emitted even when it is the language already in force: comparing here is a
  // component deciding on the parent's behalf that nothing happened.
  emit('update:language', language);
}

function move(delta: number): void {
  const count = INTERFACE_LANGUAGES.length;

  activeIndex.value = (activeIndex.value + delta + count) % count;
}

/**
 * The focus never leaves the trigger — the active row is pointed at by
 * `aria-activedescendant` — which is what keeps this to one handler rather
 * than a roving tabindex across the rows.
 */
function onKeydown(event: KeyboardEvent): void {
  const { key } = event;

  if (!open.value) {
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
      event.preventDefault();
      show();
    }

    return;
  }

  if (key === 'ArrowDown') {
    event.preventDefault();
    move(1);
  } else if (key === 'ArrowUp') {
    event.preventDefault();
    move(-1);
  } else if (key === 'Home') {
    event.preventDefault();
    activeIndex.value = 0;
  } else if (key === 'End') {
    event.preventDefault();
    activeIndex.value = INTERFACE_LANGUAGES.length - 1;
  } else if (key === 'Enter' || key === ' ') {
    // Space is prevented as well as Enter: on a button it would otherwise fire
    // a click straight after this, reopening what was just closed.
    event.preventDefault();

    const chosen = INTERFACE_LANGUAGES[activeIndex.value];

    if (chosen !== undefined) choose(chosen);
  }

  // Escape is not handled here: `useDropdown` listens for it on the document,
  // so it closes this panel from wherever the focus happens to be.
}
</script>

<template>
  <div ref="container" class="relative">
    <!-- `h-9`, the same fixed height `UserMenu` carries: they stand side by
         side in the header, and padding-derived heights left one taller. -->
    <button
      :id="id"
      ref="trigger"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="open ? optionId(activeIndex) : undefined"
      :aria-label="triggerLabel"
      :data-language="language"
      class="flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-ink transition-colors hover:bg-brand-50 focus-visible:focus-ring"
      data-testid="language-toggle"
      @click="toggle()"
      @keydown="onKeydown"
    >
      <FlagIcon :language="language" />

      <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-ink-muted" fill="none" aria-hidden="true">
        <path
          d="m6 9 6 6 6-6"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <!--
      `@mousedown.prevent` on each row is load-bearing. A row is not focusable,
      so pressing one blurs the button; `useDropdown` closes the panel on that
      blur, unmounting the row between its own mousedown and its click, and the
      press intermittently does nothing at all.
    -->
    <ul
      v-if="open"
      :id="listId"
      role="listbox"
      :aria-label="t('preferences.language')"
      class="absolute right-0 z-20 mt-1 min-w-[9rem] rounded-panel border border-line bg-surface py-1 shadow-lg"
    >
      <li
        v-for="(option, index) in INTERFACE_LANGUAGES"
        :id="optionId(index)"
        :key="option"
        role="option"
        :aria-selected="option === language ? 'true' : 'false'"
        :class="[
          index === activeIndex ? 'bg-brand-50' : '',
          option === language ? 'font-medium text-brand-700' : 'text-ink',
          'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
        ]"
        :data-testid="`language-option-${option}`"
        @mousedown.prevent
        @click="choose(option)"
        @mousemove="activeIndex = index"
      >
        <FlagIcon :language="option" />
        {{ t(OPTION_KEYS[option]) }}
      </li>
    </ul>
  </div>
</template>
