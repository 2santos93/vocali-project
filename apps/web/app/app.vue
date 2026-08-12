<script setup lang="ts">
/**
 * The root. It picks a layout and renders the page, and does nothing else.
 *
 * Anything put here runs on every screen including the sign-in form, which is
 * the one screen that must not assume there is a user.
 */
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
