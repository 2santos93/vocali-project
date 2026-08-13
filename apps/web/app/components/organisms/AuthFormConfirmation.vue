<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTranslations } from '../../i18n/translations';
import BaseButton from '../atoms/BaseButton.vue';
import BaseInput from '../atoms/BaseInput.vue';
import FormField from '../molecules/FormField.vue';

interface Props {
  email: string;
  code: string;
  busy?: boolean;
  /** A resend is in flight, which must not lock the code field. */
  resending?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
  resending: false,
});

const emit = defineEmits<{
  'update:code': [value: string];
  submit: [];
  resend: [];
}>();

const submitted = ref(false);

const { t } = useTranslations();

const codeError = computed<string | null>(() =>
  submitted.value && props.code.trim() === '' ? t('auth.confirm.codeMissing') : null,
);

function onSubmit(): void {
  submitted.value = true;

  if (codeError.value !== null) return;

  emit('submit');
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <!-- One interpolated sentence rather than three nodes: a sentence split
         around a value is one a translator cannot reorder. -->
    <p class="text-sm text-ink-muted">{{ t('auth.confirm.codeSent', { email }) }}</p>

    <FormField
      id="confirmation-code"
      :label="t('auth.confirm.codeLabel')"
      :hint="t('auth.confirm.codeHint')"
      :error="codeError"
      required
    >
      <template #default="{ id, describedBy, invalid }">
        <BaseInput
          :id="id"
          type="text"
          :model-value="code"
          autocomplete="one-time-code"
          :placeholder="t('auth.confirm.codePlaceholder')"
          :described-by="describedBy"
          :invalid="invalid"
          :disabled="busy"
          required
          @update:model-value="emit('update:code', $event)"
        />
      </template>
    </FormField>

    <BaseButton
      type="submit"
      block
      :loading="busy"
      :loading-label="t('auth.confirm.submitting')"
      class="mt-2"
    >
      {{ t('auth.confirm.submit') }}
    </BaseButton>

    <!-- Always present, not revealed after a failure: a user whose code never
         arrived has nothing to fail at first. -->
    <BaseButton
      type="button"
      variant="ghost"
      block
      :loading="resending"
      :loading-label="t('common.sending')"
      data-testid="resend-code"
      @click="emit('resend')"
    >
      {{ t('auth.confirm.resend') }}
    </BaseButton>
  </form>
</template>
