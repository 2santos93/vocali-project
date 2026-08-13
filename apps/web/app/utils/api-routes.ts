/**
 * Every path this front end calls on its own origin.
 *
 * The browser never talks to the API directly: it calls `/api/<path>` here,
 * where the BFF proxy attaches the bearer token from the httpOnly cookie and
 * forwards the rest of the path unchanged. So each constant below is the
 * `/api` prefix followed by the path the API itself serves — `/uploads`,
 * `/realtime-sessions`, `/transcriptions`, `/transcriptions/realtime`,
 * `/transcriptions/{id}/download` — which are documented on the Lambda entry
 * points and the request handlers and declared in the Terraform route list.
 *
 * Written once because `/api/transcriptions` was previously written in two
 * places, one of them a page. Terraform remains the one place a human has to
 * compare against, and that comparison is now against one file rather than
 * four call sites.
 *
 * The tests that exercise the request builders assert these paths as string
 * literals rather than importing them from here. That is deliberate: a test
 * that imports the constant it is checking asserts `constant === constant` and
 * would stay green through a path being changed to something the API does not
 * serve.
 */

const BFF_PREFIX = '/api';

export const UPLOADS_PATH = `${BFF_PREFIX}/uploads`;

export const TRANSCRIPTIONS_PATH = `${BFF_PREFIX}/transcriptions`;

export const REALTIME_SESSIONS_PATH = `${BFF_PREFIX}/realtime-sessions`;

export const REALTIME_TRANSCRIPTIONS_PATH = `${BFF_PREFIX}/transcriptions/realtime`;

/**
 * The signed-URL route for one transcript. The id is a ULID the API minted and
 * the record on screen carries, so nothing a user typed is interpolated here.
 */
export function transcriptionDownloadPath(transcriptionId: string): string {
  return `${TRANSCRIPTIONS_PATH}/${transcriptionId}/download`;
}
