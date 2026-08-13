/*
 * Vue's build-time feature flags, set on the server at start-up.
 *
 * Vue expects a bundler to substitute these. Nitro keeps `vue-i18n` external,
 * in the server bundle's own `node_modules`, so Vite's `define` never rewrites
 * it, and `install()` reads `__VUE_PROD_DEVTOOLS__` from a scope where nothing
 * declared it. The result is a ReferenceError on the first render and a 500
 * from every page, which no unit test sees because Jest mounts components
 * without this bundle.
 *
 * Written as three assignments rather than one `Object.assign`, because the
 * minifier drops the latter as having no effect.
 */
const flags = globalThis as typeof globalThis & {
  __VUE_PROD_DEVTOOLS__?: boolean;
  __VUE_OPTIONS_API__?: boolean;
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__?: boolean;
};

export default defineNitroPlugin(() => {
  flags.__VUE_PROD_DEVTOOLS__ = false;
  flags.__VUE_OPTIONS_API__ = true;
  flags.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;
});
