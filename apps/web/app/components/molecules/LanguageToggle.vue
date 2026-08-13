<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { INTERFACE_LANGUAGES } from '../../i18n/language';
import type { InterfaceLanguage } from '../../i18n/language';
import { useTranslations } from '../../i18n/translations';
import type { MessageKey } from '../../i18n/translate';
import FlagIcon from '../atoms/FlagIcon.vue';
import { useDropdown } from '../dropdown';

/**
 * Choosing the language the **interface** is written in.
 *
 * Not the language of a recording. That one is chosen per dictation, on the
 * screen that starts it, and is sent to the transcription service; this one
 * never leaves the browser and the two must never be wired to each other — a
 * clinician who reads this application in English still dictates in Catalan.
 *
 * **A listbox rather than a `<select>`, and the reason is narrow.** The header
 * has one line to spare, and the language belongs in it without a word of
 * label: closed, this is a flag and a chevron. A native select cannot show one
 * thing collapsed and another expanded — its button always shows the selected
 * option's own text — so the whole widget is built here, along with the
 * keyboard behaviour it costs. That is a real cost and it is paid once, in
 * this file, rather than by every reader of a cramped header.
 *
 * The flag is never the only thing said. Open, each row carries the language's
 * name; closed, that name is the button's accessible name. A flag is a country
 * and a language is not.
 *
 * Presentational, like every other component here: the current language
 * arrives as a prop and the chosen one leaves as an event.
 */
interface Props {
  language: InterfaceLanguage;
  id?: string;
}

const props = withDefaults(defineProps<Props>(), { id: 'interface-language' });

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

/*
 * Destructured rather than kept as one object, so that `ref="container"` in
 * the template resolves: a static ref is matched against a setup binding by
 * name, and `ref="dropdown.container"` would look for a binding with a dot in
 * it and silently find nothing.
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
 * The row the keyboard is on, which is not the row that is chosen.
 *
 * They start out the same and part company the moment somebody presses Down:
 * moving through a list is not choosing from it, and a listbox that committed
 * on every arrow key would redraw the entire application twice on the way to
 * the option the reader wanted.
 */
const activeIndex = ref(0);

// Reset each time it opens rather than left where the last visit ended: a list
// that reopens three rows down from the current language has lost the reader's
// place instead of keeping it.
watch(open, (isOpen) => {
  if (isOpen) activeIndex.value = Math.max(currentIndex.value, 0);
});

const triggerLabel = computed<string>(() =>
  t('preferences.language.current', { language: t(OPTION_KEYS[props.language]) }),
);

function choose(language: InterfaceLanguage): void {
  // Focus goes back to the button, because the row that had it is about to
  // stop existing. Left alone it would land on `<body>`, and the next Tab
  // would start again from the top of the page.
  dismiss();

  // Emitted even when it is the language already in force. The parent writes a
  // cookie it was already going to write, and the alternative — comparing here
  // — is a component deciding on the parent's behalf that nothing happened.
  emit('update:language', language);
}

function move(delta: number): void {
  const count = INTERFACE_LANGUAGES.length;

  // Wraps, because the list is two rows long and a reader pressing Down twice
  // to see the other one is not asking to be stopped at the bottom.
  activeIndex.value = (activeIndex.value + delta + count) % count;
}

/**
 * The whole keyboard contract, handled on the button.
 *
 * The focus never leaves the trigger — the active row is pointed at by
 * `aria-activedescendant` instead — which is what keeps this to one handler
 * rather than a roving tabindex across the rows.
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

  // Escape is not handled here. `useDropdown` listens for it on the document,
  // so it closes this panel from wherever the focus happens to be, and one
  // implementation of "cancel" cannot drift from the other.
}
</script>

<template>
  <div ref="container" class="relative">
    <!-- `h-9`, the same fixed height `UserMenu` carries. They stand next to
         each other in the header and hold contents of different sizes, so a
         height derived from padding left one taller than the other. -->
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
      Rendered only while it is open. A hidden panel left in the markup is a
      set of rows a screen reader can still reach and a `Tab` can still land
      on, and `aria-expanded` on the button above would be describing something
      that is not true.

      `@mousedown.prevent` on each row is not a detail. A row is not focusable
      — the focus stays on the combobox and `aria-activedescendant` points at
      the active row — so pressing one makes the browser blur the button and
      move the focus to `<body>`. `useDropdown` watches for exactly that and
      closes the panel, which unmounts the row *between its own mousedown and
      its click*: the press does nothing at all, intermittently, depending on
      how the two events happen to be scheduled. Preventing the default keeps
      the focus where the pattern says it belongs, and the click lands.
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
