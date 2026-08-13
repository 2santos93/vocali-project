const BFF_PREFIX = '/api';

export const UPLOADS_PATH = `${BFF_PREFIX}/uploads`;

export const TRANSCRIPTIONS_PATH = `${BFF_PREFIX}/transcriptions`;

export const REALTIME_SESSIONS_PATH = `${BFF_PREFIX}/realtime-sessions`;

export const REALTIME_TRANSCRIPTIONS_PATH = `${BFF_PREFIX}/transcriptions/realtime`;

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
