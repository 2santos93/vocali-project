<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  /** A percentage. Values outside 0–100, and NaN, are clamped rather than rendered. */
  value: number;
  /** Read out by assistive technology, so it must say what is progressing. */
  label: string;
  /** Hides the numeric readout without hiding it from a screen reader. */
  hideValueText?: boolean;
}

const props = withDefaults(defineProps<Props>(), { hideValueText: false });

/*
 * The value arrives from XMLHttpRequest's progress event as
 * `loaded / total * 100`. `total` is 0 until the request has a
 * Content-Length, so the first event of every upload is NaN, and rounding
 * error can push the last one just past 100. Both would render as a bar
 * stretching outside its track, and NaN would reach aria-valuenow.
 */
const percentage = computed<number>(() => {
  if (!Number.isFinite(props.value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(props.value)));
});
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted-soft">
      <div
        class="h-full rounded-full bg-brand-600 transition-[width] duration-200"
        :style="{ width: `${percentage}%` }"
        role="progressbar"
        :aria-label="label"
        :aria-valuenow="percentage"
        aria-valuemin="0"
        aria-valuemax="100"
        data-testid="progress-indicator"
      />
    </div>
    <span v-if="!hideValueText" class="w-12 text-right text-xs tabular-nums text-ink-muted">
      {{ percentage }} %
    </span>
  </div>
</template>
