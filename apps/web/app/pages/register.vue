<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTranslations } from '../i18n/translations';
import type { TranslatableMessage } from '../i18n/types';

definePageMeta({ layout: 'auth' });

const { t } = useTranslations();

useHead({ title: computed<string>(() => t('auth.register.title')) });

const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<TranslatableMessage | null>(null);

async function onSubmit(): Promise<void> {
  busy.value = true;
  error.value = null;

  try {
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    });

    await navigateTo({ path: '/confirm', query: { email: email.value } });
  } catch (cause) {
    error.value = authFailureMessage(readFailure(cause).code, 'auth.register.failed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AuthFormPanel
    :title="t('auth.register.title')"
    :description="t('auth.register.description')"
    :error="error === null ? null : t(error)"
  >
    <AuthFormCredentials
      v-model:email="email"
      v-model:password="password"
      :submit-label="t('auth.register.title')"
      password-autocomplete="new-password"
      :password-hint="t('auth.register.passwordHint')"
      :busy="busy"
      @submit="onSubmit"
    />

    <template #footer>
      {{ t('auth.register.haveAccount') }}
      <NuxtLink
        to="/login"
        class="rounded-control font-medium text-brand-700 underline focus-visible:focus-ring"
      >
        {{ t('auth.signIn.title') }}
      </NuxtLink>
    </template>
  </AuthFormPanel>
</template>
