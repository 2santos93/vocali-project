<script setup lang="ts">
import { computed, ref } from 'vue';
import type { SignedInUser } from '../../server/api/auth/login.post';
import { useTranslations } from '../i18n/translations';
import type { TranslatableMessage } from '../i18n/translate';

definePageMeta({ layout: 'auth' });

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('auth.signIn.title')) });

const route = useRoute();
const session = useAuthSession();

// Prefilled from the confirmation screen, so a user who has just proved their
// address does not type it again.
const email = ref(readQueryValue(route.query['email']) ?? '');
const password = ref('');
const busy = ref(false);

/*
 * Failures are held as keys rather than as sentences, on this screen as
 * everywhere else: somebody who fails to sign in and then switches language
 * would otherwise be left with the one line on the page in the other one.
 */
const error = ref<TranslatableMessage | null>(null);

const notice = ref<TranslatableMessage | null>(
  route.query['confirmed'] === '1' ? { key: 'auth.signIn.confirmed' } : null,
);

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

    /*
     * The code, not the server's sentence. Both say the same thing, and the
     * code is the half that can be said in the language the reader chose.
     */
    error.value = authFailureMessage(failure.code, 'auth.signIn.failed');
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
    :title="t('auth.signIn.title')"
    :description="t('auth.signIn.description')"
    :error="error === null ? null : t(error)"
    :notice="notice === null ? null : t(notice)"
  >
    <AuthFormCredentials
      v-model:email="email"
      v-model:password="password"
      :submit-label="t('auth.signIn.submit')"
      password-autocomplete="current-password"
      :busy="busy"
      @submit="onSubmit"
    />

    <template #footer>
      {{ t('auth.signIn.noAccount') }}
      <NuxtLink
        to="/register"
        class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
      >
        {{ t('auth.signIn.createAccount') }}
      </NuxtLink>
    </template>
  </AuthFormPanel>
</template>
