<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTranslations } from '../../i18n/translations';
import BaseButton from '../atoms/BaseButton.vue';
import BaseInput from '../atoms/BaseInput.vue';
import FormField from '../molecules/FormField.vue';

interface Props {
  email: string;
  password: string;
  submitLabel: string;
  /** `new-password` when registering, `current-password` when signing in. */
  passwordAutocomplete: 'new-password' | 'current-password';
  passwordHint?: string | null;
  busy?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  passwordHint: null,
  busy: false,
});

const emit = defineEmits<{
  'update:email': [value: string];
  'update:password': [value: string];
  submit: [];
}>();

/*
 * Validation appears on the first submission and not before: marking a field
 * invalid while it is still being typed is true and useless.
 */
const submitted = ref(false);

const { t } = useTranslations();

const emailError = computed<string | null>(() =>
  submitted.value && props.email.trim() === '' ? t('auth.emailMissing') : null,
);

const passwordError = computed<string | null>(() =>
  submitted.value && props.password === '' ? t('auth.passwordMissing') : null,
);

function onSubmit(): void {
  submitted.value = true;

  if (emailError.value !== null || passwordError.value !== null) return;

  emit('submit');
}
</script>

<template>
  <!-- A real form element, so Enter submits from either field. -->
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <FormField id="auth-email" :label="t('auth.email')" :error="emailError" required>
      <template #default="{ id, describedBy, invalid }">
        <BaseInput
          :id="id"
          type="email"
          :model-value="email"
          autocomplete="email"
          :placeholder="t('auth.emailPlaceholder')"
          :described-by="describedBy"
          :invalid="invalid"
          :disabled="busy"
          required
          @update:model-value="emit('update:email', $event)"
        />
      </template>
    </FormField>

    <FormField
      id="auth-password"
      :label="t('auth.password')"
      :hint="passwordHint"
      :error="passwordError"
      required
    >
      <template #default="{ id, describedBy, invalid }">
        <BaseInput
          :id="id"
          type="password"
          :model-value="password"
          :autocomplete="passwordAutocomplete"
          :described-by="describedBy"
          :invalid="invalid"
          :disabled="busy"
          required
          @update:model-value="emit('update:password', $event)"
        />
      </template>
    </FormField>

    <BaseButton
      type="submit"
      block
      :loading="busy"
      :loading-label="t('common.sending')"
      class="mt-2"
    >
      {{ submitLabel }}
    </BaseButton>
  </form>
</template>
