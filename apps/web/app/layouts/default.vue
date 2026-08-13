<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTranslations } from '../i18n/translations';
import type { MessageKey } from '../i18n/translate';

/**
 * The application chrome every signed-in screen renders inside.
 *
 * It owns the header, the navigation, the signed-in address and the sign-out
 * control, and it owns the page container — the width, the padding and the
 * vertical rhythm — so that a screen starts at its own `<h1>` and never has to
 * agree with the other screens about margins. It does not render a page title:
 * each page names itself.
 */

const session = useAuthSession();
const theme = useThemePreference();
const language = useInterfaceLanguage();
const { t } = useTranslations();
const signingOut = ref(false);

/*
 * The routes are Spanish and stay Spanish — they are addresses, and an English
 * interface must not change where a saved link points. Only the words on the
 * links move.
 */
const NAVIGATION: readonly { to: string; labelKey: MessageKey }[] = [
  { to: '/transcribir', labelKey: 'nav.transcribeFile' },
  { to: '/dictar', labelKey: 'nav.dictate' },
  { to: '/historial', labelKey: 'nav.history' },
];

const navigation = computed(() =>
  NAVIGATION.map((item) => ({ to: item.to, label: t(item.labelKey) })),
);

async function onSignOut(): Promise<void> {
  // Guarded rather than merely visually disabled: a double click on a slow
  // connection would otherwise send a second global sign-out with a token the
  // first has already revoked.
  if (signingOut.value) return;

  signingOut.value = true;

  try {
    await session.signOut();
  } finally {
    signingOut.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-surface-muted">
    <header class="border-b border-line bg-surface">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <NuxtLink
          to="/historial"
          class="rounded-control text-lg font-semibold tracking-tight text-brand-700 focus-visible:focus-ring"
        >
          Vocali
        </NuxtLink>

        <!-- A landmark, so a screen reader user can jump to the navigation
             instead of hearing three links announced as loose text. -->
        <nav :aria-label="t('nav.primary')" class="flex flex-wrap items-center gap-1">
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="rounded-control px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:focus-ring"
            active-class="bg-brand-50 text-brand-700"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <!--
          Two controls where there were four. The address, the theme and the
          sign-out button all belong to the person signed in, and they now sit
          behind one avatar: the header keeps a fixed width whatever the
          address is, and the sign-out control can no longer be pushed off a
          narrow screen by a long one.

          The language stays outside the menu, on purpose. It is the one
          preference somebody may need while unable to read the interface, and
          burying it behind a button whose label they cannot read would put the
          way out on the other side of the problem. Collapsed to its flag, it
          costs the header less than the label it used to carry.
        -->
        <div class="ml-auto flex items-center gap-2">
          <LanguageToggle
            :language="language.current.value"
            @update:language="language.choose($event)"
          />

          <UserMenu
            v-if="session.user.value !== null"
            :email="session.user.value.email"
            :preference="theme.preference.value"
            :dark="theme.isDark.value"
            :signing-out="signingOut"
            @update:preference="theme.choose($event)"
            @sign-out="onSignOut"
          />
        </div>
      </div>
    </header>

    <!-- The single main landmark, and the page's container. Screens render
         their own heading straight into the slot. -->
    <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <slot />
    </main>
  </div>
</template>
