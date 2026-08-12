<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  /**
   * Owns the identity of the whole group: the label points at it, and the
   * hint and error ids are derived from it. One value, so the three can
   * never drift apart.
   */
  id: string;
  label: string;
  hint?: string | null;
  error?: string | null;
  required?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hint: null,
  error: null,
  required: false,
});

const hintId = computed<string>(() => `${props.id}-hint`);
const errorId = computed<string>(() => `${props.id}-error`);

const isInvalid = computed<boolean>(() => props.error !== null && props.error !== '');
const hasHint = computed<boolean>(() => props.hint !== null && props.hint !== '');

/*
 * The whole point of the component. A message rendered next to a control but
 * not referenced by it is invisible to a screen reader: the user hears
 * "Correo electrónico, campo de texto" and no reason why the form refused.
 *
 * Both ids are listed when both are shown, and the error goes last so it is
 * the final thing announced. Null when there is nothing to point at, which
 * drops the attribute rather than emitting a dangling reference.
 */
const describedBy = computed<string | null>(() => {
  const ids: string[] = [];
  if (hasHint.value) {
    ids.push(hintId.value);
  }
  if (isInvalid.value) {
    ids.push(errorId.value);
  }
  return ids.length > 0 ? ids.join(' ') : null;
});
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium text-ink">
      {{ label }}
      <template v-if="required">
        <span class="text-danger-ink" aria-hidden="true">*</span>
        <span class="sr-only">(obligatorio)</span>
      </template>
    </label>

    <slot :id="id" :described-by="describedBy" :invalid="isInvalid" />

    <p v-if="hasHint" :id="hintId" class="text-xs text-ink-muted">{{ hint }}</p>

    <!-- role="alert" so a validation failure is announced when it appears,
         not only when the field is next focused. -->
    <p v-if="isInvalid" :id="errorId" role="alert" class="text-xs font-medium text-danger-ink">
      {{ error }}
    </p>
  </div>
</template>
