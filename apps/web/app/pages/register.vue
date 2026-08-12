<script setup lang="ts">
import { ref } from 'vue';

definePageMeta({ layout: false });
useHead({ title: 'Crear cuenta' });

const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const PASSWORD_HINT = 'Mínimo 8 caracteres, con mayúsculas, minúsculas, números y algún símbolo.';

const GENERIC_FAILURE = 'No hemos podido crear la cuenta. Vuelve a intentarlo en unos minutos.';

async function onSubmit(): Promise<void> {
  busy.value = true;
  error.value = null;

  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });

    /*
     * Always the confirmation screen, whatever the address turned out to be.
     *
     * The server answers a repeat registration exactly as it answers a new
     * one, so this screen cannot tell the two apart — which is the point. If
     * the account already existed and was confirmed, the code will not work
     * and the confirmation screen says to sign in instead.
     */
    await navigateTo({ path: '/confirm', query: { email: email.value } });
  } catch (cause) {
    error.value = readFailure(cause).message ?? GENERIC_FAILURE;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthFormPanel
    title="Crear cuenta"
    description="Te enviaremos un código para confirmar tu correo electrónico."
    :error="error"
  >
    <AuthFormCredentials
      v-model:email="email"
      v-model:password="password"
      submit-label="Crear cuenta"
      password-autocomplete="new-password"
      :password-hint="PASSWORD_HINT"
      :busy="busy"
      @submit="onSubmit"
    />

    <template #footer>
      ¿Ya tienes cuenta?
      <NuxtLink
        to="/login"
        class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
      >
        Iniciar sesión
      </NuxtLink>
    </template>
  </AuthFormPanel>
</template>
