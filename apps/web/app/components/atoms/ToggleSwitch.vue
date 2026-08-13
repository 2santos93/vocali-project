<script setup lang="ts">
/**
 * A two-state setting, as a row you can press anywhere.
 *
 * `role="switch"` on a real `<button>`, not a checkbox dressed up in CSS. A
 * button is focusable, is operated by Enter and Space without a line of key
 * handling, and `aria-checked` is what makes a screen reader say "on" and
 * "off" rather than "checked" — which is the difference between a setting that
 * is currently applied and a box somebody has ticked on a form they have not
 * submitted yet.
 *
 * The whole row is the control, label included. A switch whose hit target is
 * the twenty-pixel track beside the words is a switch that gets missed on a
 * touchscreen, and there is nothing else in the row for a stray press to hit.
 *
 * Presentational, like everything else here: the state arrives as a prop and
 * the requested one leaves as an event.
 */
interface Props {
  modelValue: boolean;
  /** Visible, and therefore also the accessible name. Never an `aria-label`. */
  label: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    class="flex w-full items-center justify-between gap-3 rounded-control px-2 py-1.5 text-left text-sm text-ink transition-colors hover:bg-brand-50 focus-visible:focus-ring"
    @click="emit('update:modelValue', !props.modelValue)"
  >
    <span class="flex items-center gap-2">
      <slot name="icon" />
      {{ label }}
    </span>

    <!-- The track and the thumb say nothing a screen reader has not already
         been told by `aria-checked`, so they are hidden from it entirely. -->
    <span
      aria-hidden="true"
      :class="[
        modelValue ? 'bg-brand-solid' : 'bg-muted-line',
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
      ]"
    >
      <span
        :class="[
          modelValue ? 'translate-x-4' : 'translate-x-0',
          'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-ink-inverse shadow-sm transition-transform',
        ]"
      />
    </span>
  </button>
</template>
