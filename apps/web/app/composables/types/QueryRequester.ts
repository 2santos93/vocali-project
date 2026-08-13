/**
 * Named here rather than reaching for ofetch's own type, so nothing below the
 * page mentions Nuxt and a test can supply a plain function. A convention
 * only: nothing in the build would reject the Nuxt type here.
 */
export type QueryRequester = (path: string, query: Record<string, string>) => Promise<unknown>;
