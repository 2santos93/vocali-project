<script setup lang="ts">
import type { InterfaceLanguage } from '../../i18n/types/InterfaceLanguage';

/**
 * Drawn rather than the `🇪🇸` emoji: Windows ships no flag glyphs, so the emoji
 * renders as the letters `ES` in a box.
 *
 * `aria-hidden`, because a flag is a country and a language is not — `en` here
 * is `en-GB`. Every place that shows one names the language in text as well.
 */
interface Props {
  language: InterfaceLanguage;
}

defineProps<Props>();
</script>

<template>
  <span
    class="inline-block h-4 w-5 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-inset ring-black/10"
    aria-hidden="true"
    :data-flag="language"
  >
    <!-- Spain: the bands are 1:2:1, not thirds. -->
    <svg v-if="language === 'es'" viewBox="0 0 60 40" class="h-full w-full">
      <rect width="60" height="40" fill="#c60b1e" />
      <rect y="10" width="60" height="20" fill="#ffc400" />
    </svg>

    <!-- The counterchange of the diagonals is left out on purpose: invisible at
         twenty pixels, and it would double the markup. -->
    <svg v-else viewBox="0 0 60 40" class="h-full w-full">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#ffffff" stroke-width="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#c8102e" stroke-width="4" />
      <path d="M30 0V40M0 20H60" stroke="#ffffff" stroke-width="13" />
      <path d="M30 0V40M0 20H60" stroke="#c8102e" stroke-width="8" />
    </svg>
  </span>
</template>
