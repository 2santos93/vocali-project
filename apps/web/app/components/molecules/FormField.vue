<script setup lang="ts">
import { computed } from 'vue';
import { useTranslations } from '../../i18n/translations';

interface Props {
  /**
   * Owns the identity of the whole group: the label points at it and the hint
   * and error ids are derived from it, so the three cannot drift apart.
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

const { t } = useTranslations();

const hintId = computed<string>(() => `${props.id}-hint`);
const errorId = computed<string>(() => `${props.id}-error`);

const isInvalid = computed<boolean>(() => props.error !== null && props.error !== '');
const hasHint = computed<boolean>(() => props.hint !== null && props.hint !== '');

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
        <span class="sr-only">{{ t('common.required') }}</span>
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
