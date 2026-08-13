/**
 * Each of these bounds the life of a bearer credential, so none is read from
 * the environment: a bound a deployment can widen from a console variable is a
 * suggestion.
 */

export const UPLOAD_URL_TTL_SECONDS = 900;

export const DOWNLOAD_URL_TTL_SECONDS = 900;

export const AUDIO_READ_URL_TTL_SECONDS = 3_600;

export const REALTIME_SESSION_TTL_SECONDS = 60;

/**
 * The browser does one thing with a ticket — it opens the socket — so anything
 * longer is a window in which a ticket read out of an access log still works.
 */
export const CONNECTION_TICKET_TTL_SECONDS = 30;

/**
 * API Gateway closes a websocket after two hours regardless, so no entry can
 * describe a live connection past that. The extra fifteen minutes is slack
 * against clock skew, and it is the safer direction: expiring early would drop
 * pushes for a connection that is still open, while expiring late costs a
 * publish that answers 410 and is cleaned up on the spot.
 */
export const CONNECTION_TTL_SECONDS = 2 * 60 * 60 + 15 * 60;
