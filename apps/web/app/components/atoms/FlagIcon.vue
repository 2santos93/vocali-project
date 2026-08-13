<script setup lang="ts">
import type { InterfaceLanguage } from '../../i18n/language';

/**
 * The flag standing in for an interface language.
 *
 * **Drawn rather than written.** The obvious implementation is the regional
 * indicator emoji, `🇪🇸`, and it is wrong in the two places it matters: Windows
 * ships no flag glyphs at all, so it renders as the letters `ES` in a box, and
 * every platform that does have them draws them at a different size and
 * baseline from every other. Two rectangles of SVG are the same picture on
 * every machine a clinic owns.
 *
 * **Decorative, never the only thing said.** A flag is a country and a
 * language is not — `en` here is `en-GB`, and the same flag would be wrong for
 * a reader in Dublin. So it is `aria-hidden`, and every place that shows one
 * carries the name of the language too: as visible text in the open list, and
 * as the accessible name of the button when the list is closed. Nothing in
 * this application asks anybody to recognise a country to change a setting.
 *
 * Keyed by the union, so a third interface language cannot ship without
 * somebody deciding what it looks like.
 *
 * The corners are rounded on the wrapper with `overflow-hidden` rather than by
 * a clip path per flag: each flag is drawn edge to edge, and the shape of the
 * box is this component's business rather than each drawing's.
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

    <!--
      The United Kingdom, because the English catalogue is `en-GB` and writes
      12/08/2026 the European way. The counterchange of the diagonals is left
      out deliberately: at twenty pixels it is invisible, and drawing it would
      double the markup to reproduce a detail no reader can see.
    -->
    <svg v-else viewBox="0 0 60 40" class="h-full w-full">
      <rect width="60" height="40" fill="#012169" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#ffffff" stroke-width="8" />
      <path d="M0 0 60 40M60 0 0 40" stroke="#c8102e" stroke-width="4" />
      <path d="M30 0V40M0 20H60" stroke="#ffffff" stroke-width="13" />
      <path d="M30 0V40M0 20H60" stroke="#c8102e" stroke-width="8" />
    </svg>
  </span>
</template>
