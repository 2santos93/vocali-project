/**
 * The HTTP statuses this front end branches on.
 *
 * `HTTP_UNAUTHORIZED` was previously declared once in `useFileUpload`, again in
 * `useAudioRecorder`, and written as a bare `401` in `useTranscriptionHistory`
 * — three copies of the one status that decides whether a user is told to sign
 * in again or told to check their connection. The rest are here so the set is
 * one set.
 *
 * In `app/utils` rather than a directory of its own because that is the
 * package's Nuxt-free, browser-agnostic shelf: nothing here needs a runtime to
 * evaluate, and the lint configuration resolves this directory to the
 * application's TypeScript project explicitly.
 */

export const HTTP_OK = 200;

/** The upper bound of the 2xx range, exclusive: `>= OK && < MULTIPLE_CHOICES` is success. */
export const HTTP_MULTIPLE_CHOICES = 300;

/**
 * The session is over, not merely stale. The BFF proxy refreshes an expired
 * access token before it would ever surface, so a 401 reaching the browser
 * means signing in again is the remedy.
 */
export const HTTP_UNAUTHORIZED = 401;

/** From S3: the presigned POST's policy expired or its conditions were not met. */
export const HTTP_FORBIDDEN = 403;

export const HTTP_PAYLOAD_TOO_LARGE = 413;

export const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
