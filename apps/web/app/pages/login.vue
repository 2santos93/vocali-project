<script setup lang="ts">
import { ref } from 'vue';
import type { SignedInUser } from '../../server/api/auth/login.post';

definePageMeta({ layout: false });
useHead({ title: 'Iniciar sesión' });

const route = useRoute();
const session = useAuthSession();

// Prefilled from the confirmation screen, so a user who has just proved their
// address does not type it again.
const email = ref(readQueryValue(route.query['email']) ?? '');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const notice = ref<string | null>(
  route.query['confirmed'] === '1' ? 'Tu cuenta ya está confirmada. Puedes iniciar sesión.' : null,
);

const GENERIC_FAILURE = 'No hemos podido iniciar sesión. Vuelve a intentarlo en unos minutos.';

async function onSubmit(): Promise<void> {
  busy.value = true;
  error.value = null;
  notice.value = null;

  try {
    const user = await $fetch<SignedInUser>('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });

    // Recorded from the reply rather than fetched again: the server has just
    // told us who signed in, and asking a second time is a round trip that
    // shows an empty header while it runs.
    session.adopt(user);

    await navigateTo(safeRedirectTarget(route.query['redirect']) ?? HOME_ROUTE);
  } catch (cause) {
    const failure = readFailure(cause);

    /*
     * An unconfirmed account is not a wrong password, and telling the user it
     * is leaves them retyping a password that was correct. The one route
     * forward is the confirmation screen, so take them there.
     */
    if (failure.code === 'ACCOUNT_NOT_CONFIRMED') {
      await navigateTo({ path: '/confirm', query: { email: email.value } });

      return;
    }

    error.value = failure.message ?? GENERIC_FAILURE;
  } finally {
    busy.value = false;
  }
}

/**
 * Only used for the prefilled address, which is display state: an address that
 * arrives as anything but a non-empty string leaves the field empty. The
 * `redirect` parameter is a different matter and is checked by
 * `safeRedirectTarget`, which lives in `utils/route-access` where a test can
 * reach it.
 */
function readQueryValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
</script>

<template>
  <AuthFormPanel
    title="Iniciar sesión"
    description="Accede con la cuenta de tu centro."
    :error="error"
    :notice="notice"
  >
    <AuthFormCredentials
      v-model:email="email"
      v-model:password="password"
      submit-label="Entrar"
      password-autocomplete="current-password"
      :busy="busy"
      @submit="onSubmit"
    />

    <template #footer>
      ¿Todavía no tienes cuenta?
      <NuxtLink
        to="/register"
        class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
      >
        Crear una cuenta
      </NuxtLink>
    </template>
  </AuthFormPanel>
</template>
