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

    await navigateTo(safeRedirectTarget(route.query['redirect']) ?? '/historial');
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

function readQueryValue(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Where to go after signing in, if it is somewhere in this application.
 *
 * The value arrives in the URL, so it is chosen by whoever wrote the link. A
 * sign-in page that will forward to any address it is handed is a phishing
 * primitive: the victim sees a genuine sign-in form on the genuine domain and
 * is delivered to the attacker afterwards. Only a local path is accepted, and
 * `//host` is rejected explicitly because it is a path by the loosest reading
 * and an absolute URL to the browser.
 */
function safeRedirectTarget(value: unknown): string | null {
  const target = readQueryValue(value);
  if (target === null) return null;

  if (!target.startsWith('/')) return null;
  if (target.startsWith('//')) return null;
  if (target.includes('\\')) return null;

  return target;
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
