<script setup lang="ts">
import { ref } from 'vue';

definePageMeta({ layout: false });
useHead({ title: 'Confirmar cuenta' });

const route = useRoute();

const emailFromQuery = route.query['email'];
const email = ref(typeof emailFromQuery === 'string' ? emailFromQuery : '');

const code = ref('');
const busy = ref(false);
const resending = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

const GENERIC_FAILURE = 'No hemos podido confirmar la cuenta. Vuelve a intentarlo en unos minutos.';

async function onSubmit(): Promise<void> {
  busy.value = true;
  error.value = null;
  notice.value = null;

  try {
    await $fetch('/api/auth/confirm', {
      method: 'POST',
      body: { email: email.value, code: code.value },
    });

    await navigateTo({ path: '/login', query: { confirmed: '1', email: email.value } });
  } catch (cause) {
    error.value = readFailure(cause).message ?? GENERIC_FAILURE;
  } finally {
    busy.value = false;
  }
}

/**
 * The way out of an expired code, and the reason this screen is not a dead
 * end.
 *
 * The reply is the same sentence whatever happened at Cognito — unknown
 * address, already confirmed, or a message genuinely on its way — because a
 * resend control that reported the difference would be the user enumeration
 * endpoint the sign-up form is deliberately not.
 */
async function onResend(): Promise<void> {
  resending.value = true;
  error.value = null;
  notice.value = null;

  try {
    await $fetch('/api/auth/resend', { method: 'POST', body: { email: email.value } });

    notice.value = 'Te hemos enviado un código nuevo. Puede tardar un par de minutos en llegar.';
    code.value = '';
  } catch (cause) {
    error.value =
      readFailure(cause).message ?? 'No hemos podido enviar un código nuevo. Inténtalo más tarde.';
  } finally {
    resending.value = false;
  }
}
</script>

<template>
  <AuthFormPanel title="Confirma tu correo" :error="error" :notice="notice">
    <!-- Landing here without an address means the screen was reached directly
         rather than through registration or a sign-in attempt. There is no
         code to check against nothing, so say what to do instead of showing a
         form that cannot work. -->
    <div v-if="email === ''" class="flex flex-col gap-4 text-sm text-ink-muted">
      <p>
        Necesitamos saber qué cuenta quieres confirmar. Vuelve a introducir tus datos o inicia
        sesión para que te enviemos un código nuevo.
      </p>
      <div class="flex flex-wrap gap-3">
        <NuxtLink
          to="/register"
          class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
        >
          Crear cuenta
        </NuxtLink>
        <NuxtLink
          to="/login"
          class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
        >
          Iniciar sesión
        </NuxtLink>
      </div>
    </div>

    <AuthFormConfirmation
      v-else
      v-model:code="code"
      :email="email"
      :busy="busy"
      :resending="resending"
      @submit="onSubmit"
      @resend="onResend"
    />

    <template #footer>
      ¿Prefieres empezar de nuevo?
      <NuxtLink
        to="/register"
        class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
      >
        Crear otra cuenta
      </NuxtLink>
    </template>
  </AuthFormPanel>
</template>
