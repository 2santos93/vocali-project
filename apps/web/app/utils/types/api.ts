export interface ApiRequestOptions {
  readonly method: 'GET' | 'POST';
  readonly body?: Record<string, unknown>;
}

/**
 * How this front end asks the API for something.
 *
 * The browser never calls the API directly, so every request this application
 * makes is one call to the BFF proxy: a path from `api-routes`, a method, and
 * on a write a JSON body. That is the entire vocabulary, and it is narrowed to
 * it on purpose.
 *
 * The page passes `$fetch` in through this shape. Naming it here rather than
 * reaching for ofetch's own type is what keeps every layer below the page free
 * of Nuxt. That freedom is a convention rather than a guarantee: ts-jest type
 * checks nothing in this configuration, and `tsconfig.app.json` gives the
 * composables the Nuxt types deliberately, since composables are allowed the
 * runtime. What this type buys is a collaborator a test hands over as a plain
 * function, with no runtime to boot.
 *
 * Written once because it was previously written twice, identically, in
 * `useFileUpload` and in `useTranscriptionUpdates`, with nothing keeping the
 * two in step. Nuxt resolves an auto-imported name to a single module, so a
 * page annotating `const request: ApiRequester` was silently getting one copy
 * while a composable importing the name by path got the other — and `nuxt
 * prepare` said so on every install.
 */
export type ApiRequester = (path: string, options: ApiRequestOptions) => Promise<unknown>;
