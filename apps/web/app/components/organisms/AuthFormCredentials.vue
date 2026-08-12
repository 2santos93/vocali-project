<script setup lang="ts">
import { computed, ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';
import BaseInput from '../atoms/BaseInput.vue';
import FormField from '../molecules/FormField.vue';

/**
 * An address and a password: the form behind both signing in and registering.
 *
 * One component rather than two, because the two differ only in their labels,
 * their autocomplete tokens and whether a password hint is shown — and two
 * copies would have drifted in their accessibility wiring within a week.
 *
 * Controlled: the values live in the page, arrive as props and leave as
 * events. That keeps the component free of any opinion about what a submission
 * means, which is what lets it mount under Jest with no Nuxt runtime.
 */

interface Props {
  email: string;
  password: string;
  submitLabel: string;
  /** `new-password` when registering, `current-password` when signing in. */
  passwordAutocomplete: 'new-password' | 'current-password';
  passwordHint?: string | null;
  /** A request is in flight: the button is busy and the fields are locked. */
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
 * Validation appears on the first submission and not before.
 *
 * Marking a field invalid while it is still being filled in tells a user their
 * half-typed address is wrong, which it is, and which is not useful.
 */
const submitted = ref(false);

const emailError = computed<string | null>(() =>
  submitted.value && props.email.trim() === '' ? 'Introduce tu correo electrónico.' : null,
);

const passwordError = computed<string | null>(() =>
  submitted.value && props.password === '' ? 'Introduce tu contraseña.' : null,
);

function onSubmit(): void {
  submitted.value = true;

  if (emailError.value !== null || passwordError.value !== null) return;

  emit('submit');
}
</script>

<template>
  <!-- A real form element, so Enter submits from either field. A div with a
       click handler is a sign-in form that only works with a mouse. -->
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <FormField id="auth-email" label="Correo electrónico" :error="emailError" required>
      <template #default="{ id, describedBy, invalid }">
        <BaseInput
          :id="id"
          type="email"
          :model-value="email"
          autocomplete="email"
          placeholder="nombre@centro.es"
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
      label="Contraseña"
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

    <BaseButton type="submit" block :loading="busy" loading-label="Enviando" class="mt-2">
      {{ submitLabel }}
    </BaseButton>
  </form>
</template>
