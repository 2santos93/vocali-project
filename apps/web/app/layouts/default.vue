<script setup lang="ts">
import { ref } from 'vue';

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
const signingOut = ref(false);

const NAVIGATION = [
  { to: '/transcribir', label: 'Transcribir archivo' },
  { to: '/dictar', label: 'Dictar' },
  { to: '/historial', label: 'Historial' },
] as const;

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
        <nav aria-label="Principal" class="flex flex-wrap items-center gap-1">
          <NuxtLink
            v-for="item in NAVIGATION"
            :key="item.to"
            :to="item.to"
            class="rounded-control px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-brand-50 hover:text-brand-700 focus-visible:focus-ring"
            active-class="bg-brand-50 text-brand-700"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="ml-auto flex items-center gap-3">
          <!-- Truncated rather than allowed to push the sign-out control off a
               narrow screen. A long address is common and a missing sign-out
               button is not acceptable. -->
          <span
            v-if="session.user.value !== null"
            class="hidden max-w-[16rem] truncate text-sm text-ink-muted sm:inline"
            :title="session.user.value.email"
            data-testid="signed-in-user"
          >
            {{ session.user.value.email }}
          </span>

          <BaseButton
            variant="secondary"
            size="sm"
            :loading="signingOut"
            loading-label="Cerrando sesión"
            data-testid="sign-out"
            @click="onSignOut"
          >
            Cerrar sesión
          </BaseButton>
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
