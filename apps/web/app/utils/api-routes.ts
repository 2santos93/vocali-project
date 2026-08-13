/**
 * Each constant is the `/api` prefix the BFF proxy strips, followed by the
 * path the API itself serves. Terraform's route list is the one place a human
 * has to compare against, and that comparison is now against one file.
 *
 * The tests assert these paths as string **literals** rather than importing
 * them from here, deliberately: a test that imports the constant it is
 * checking asserts `constant === constant` and would stay green through a path
 * being changed to something the API does not serve.
 */

const BFF_PREFIX = '/api';

export const UPLOADS_PATH = `${BFF_PREFIX}/uploads`;

export const TRANSCRIPTIONS_PATH = `${BFF_PREFIX}/transcriptions`;

export const REALTIME_SESSIONS_PATH = `${BFF_PREFIX}/realtime-sessions`;

export const REALTIME_TRANSCRIPTIONS_PATH = `${BFF_PREFIX}/transcriptions/realtime`;

/**
 * Mints the short-lived, single-use credential the update socket is opened
 * with: the point is to turn a header-borne session into something safe to
 * put in a websocket's query string.
 */
export const CONNECTION_TICKETS_PATH = `${BFF_PREFIX}/connection-tickets`;

/**
 * One transcription by id, which is what the push fallback polls rather than
 * fetching and searching a page of history per attempt.
 */
export function transcriptionPath(transcriptionId: string): string {
  return `${TRANSCRIPTIONS_PATH}/${transcriptionId}`;
}

/**
 * The id is a ULID the API minted and the record on screen carries, so nothing
 * a user typed is interpolated here.
 */
export function transcriptionDownloadPath(transcriptionId: string): string {
  return `${TRANSCRIPTIONS_PATH}/${transcriptionId}/download`;
}
