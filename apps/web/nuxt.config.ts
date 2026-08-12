import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-11',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      // The interface is Spanish. Without this the document declares no
      // language and a screen reader pronounces it with the reader's default
      // voice, which turns "transcripción" into noise.
      htmlAttrs: { lang: 'es' },
      titleTemplate: '%s · Vocali',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },

  // Tailwind v4 is a Vite plugin rather than a PostCSS plugin, and its
  // configuration lives in CSS. `app/assets/css/tokens.css` is the single
  // place the palette, spacing and radii are defined.
  vite: {
    plugins: [tailwindcss()],
  },

  // `pathPrefix: false` keeps a component's name its file name, so the
  // atoms/molecules/organisms folders classify the design system without
  // renaming `BaseButton` to `AtomsBaseButton` in every template.
  components: [{ path: '~/components', pathPrefix: false }],

  /*
   * Everything here is read on the server only.
   *
   * There is no `public` block, deliberately. A key placed there is inlined
   * into the client bundle, and the whole authentication design rests on the
   * browser never holding a Cognito credential. The user pool id and the
   * client id are not secrets, but they have no use in the browser either,
   * and a `public` block invites the next value to be added next to them.
   *
   * The client secret is not here at all. It is read at runtime from
   * Parameter Store, decrypted, through the path named below — the same
   * arrangement the API uses for the provider key, and the reason no secret
   * appears in this repository, in a default, or in a plaintext environment
   * variable.
   *
   * Every value is overridden by its `NUXT_`-prefixed environment variable:
   * `NUXT_API_BASE_URL`, `NUXT_COGNITO_REGION`, `NUXT_COGNITO_USER_POOL_ID`,
   * `NUXT_COGNITO_CLIENT_ID`, `NUXT_COGNITO_CLIENT_SECRET_PARAMETER`.
   */
  runtimeConfig: {
    apiBaseUrl: '',
    cognito: {
      region: '',
      userPoolId: '',
      clientId: '',
      clientSecretParameter: '',
    },
  },

  // `vue-tsc --noEmit` already runs as the package's `typecheck` script and in
  // CI, over the three projects the front end is split into. Repeating it
  // inside the dev server and the build only slows both down.
  typescript: { typeCheck: false },
});
