import tailwindcss from '@tailwindcss/vite';
import { defineNuxtConfig } from 'nuxt/config';

export default defineNuxtConfig({
  compatibilityDate: '2026-08-11',
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

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

  // `vue-tsc --noEmit` already runs as the package's `typecheck` script and in
  // CI. Repeating it inside the dev server and the build only slows both down.
  typescript: { typeCheck: false },
});
