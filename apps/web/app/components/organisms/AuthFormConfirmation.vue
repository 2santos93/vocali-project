<script setup lang="ts">
import { computed, ref } from 'vue';
import BaseButton from '../atoms/BaseButton.vue';
import BaseInput from '../atoms/BaseInput.vue';
import FormField from '../molecules/FormField.vue';

/**
 * The confirmation code, and the way out of one that has expired.
 *
 * The resend control is not an afterthought. A confirmation code sits in an
 * inbox while the user does something else, and by the time they come back it
 * has expired — so "the code no longer works" is the ordinary path through
 * this screen, not an edge case. Without a way to ask for another one the
 * account can never be used, and the screen is a dead end.
 *
 * Controlled and presentational: values in as props, intent out as events.
 */

interface Props {
  /** The address being confirmed. Shown, not editable — it was just typed. */
  email: string;
  code: string;
  /** A confirmation is in flight. */
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

const codeError = computed<string | null>(() =>
  submitted.value && props.code.trim() === '' ? 'Introduce el código que te hemos enviado.' : null,
);

function onSubmit(): void {
  submitted.value = true;

  if (codeError.value !== null) return;

  emit('submit');
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <p class="text-sm text-ink-muted">
      Hemos enviado un código de 6 dígitos a
      <span class="font-medium text-ink">{{ email }}</span
      >. Revisa también la carpeta de correo no deseado.
    </p>

    <FormField
      id="confirmation-code"
      label="Código de verificación"
      hint="Seis dígitos, sin espacios."
      :error="codeError"
      required
    >
      <template #default="{ id, describedBy, invalid }">
        <BaseInput
          :id="id"
          type="text"
          :model-value="code"
          autocomplete="one-time-code"
          placeholder="123456"
          :described-by="describedBy"
          :invalid="invalid"
          :disabled="busy"
          required
          @update:model-value="emit('update:code', $event)"
        />
      </template>
    </FormField>

    <BaseButton type="submit" block :loading="busy" loading-label="Confirmando" class="mt-2">
      Confirmar cuenta
    </BaseButton>

    <!-- Always present, not revealed only after a failure. A user whose code
         never arrived has nothing to fail at first. -->
    <BaseButton
      type="button"
      variant="ghost"
      block
      :loading="resending"
      loading-label="Enviando"
      data-testid="resend-code"
      @click="emit('resend')"
    >
      Enviar un código nuevo
    </BaseButton>
  </form>
</template>
