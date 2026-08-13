import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-11',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      titleTemplate: '%s · Vocali',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  components: [{ path: '~/components', pathPrefix: false, extensions: ['vue'] }],

  runtimeConfig: {
    apiBaseUrl: '',
    cognito: {
      region: '',
      userPoolId: '',
      clientId: '',
      clientSecretParameter: '',
    },
  },

  typescript: { typeCheck: false },
});
