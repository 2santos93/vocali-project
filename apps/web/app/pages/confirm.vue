<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTranslations } from '../i18n/translations';
import type { TranslatableMessage } from '../i18n/types/TranslatableMessage';

definePageMeta({ layout: 'auth' });

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('auth.confirm.title')) });

const route = useRoute();

const emailFromQuery = route.query['email'];
const email = ref(typeof emailFromQuery === 'string' ? emailFromQuery : '');

const code = ref('');
const busy = ref(false);
const resending = ref(false);
const error = ref<TranslatableMessage | null>(null);
const notice = ref<TranslatableMessage | null>(null);

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
    error.value = authFailureMessage(readFailure(cause).code, 'auth.confirm.failed');
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

    notice.value = { key: 'auth.confirm.resent' };
    code.value = '';
  } catch (cause) {
    error.value = authFailureMessage(readFailure(cause).code, 'auth.confirm.resendFailed');
  } finally {
    resending.value = false;
  }
}
</script>

<template>
  <AuthFormPanel
    :title="t('auth.confirm.title')"
    :error="error === null ? null : t(error)"
    :notice="notice === null ? null : t(notice)"
  >
    <!-- Landing here without an address means the screen was reached directly
         rather than through registration or a sign-in attempt. There is no
         code to check against nothing, so say what to do instead of showing a
         form that cannot work. -->
    <div v-if="email === ''" class="flex flex-col gap-4 text-sm text-ink-muted">
      <p>{{ t('auth.confirm.noAddress') }}</p>
      <div class="flex flex-wrap gap-3">
        <NuxtLink
          to="/register"
          class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
        >
          {{ t('auth.register.title') }}
        </NuxtLink>
        <NuxtLink
          to="/login"
          class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
        >
          {{ t('auth.signIn.title') }}
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
      {{ t('auth.confirm.startOver') }}
      <NuxtLink
        to="/register"
        class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
      >
        {{ t('auth.confirm.createAnother') }}
      </NuxtLink>
    </template>
  </AuthFormPanel>
</template>
