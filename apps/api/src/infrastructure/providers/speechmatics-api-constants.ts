/**
 * The Speechmatics API as this adapter meets it: which hosts it talks to, and
 * the two limits the provider imposes on what it will accept.
 *
 * Held apart from the adapter because they are facts about somebody else's
 * service rather than decisions this codebase makes. When the provider moves a
 * host or widens a range, this is the file that changes and the adapter is not
 * touched at all.
 */

/**
 * The EU regional hosts, chosen to match the `eu-west-1` deployment: clinical
 * audio stays in the same jurisdiction as the rest of the platform, and the
 * round trip is shorter than to the global endpoint.
 */
export const BATCH_JOBS_URL = 'https://eu1.asr.api.speechmatics.com/v2/jobs/';
export const TEMPORARY_KEY_URL = 'https://mp.speechmatics.com/v1/api_keys?type=rt';
export const REALTIME_WEBSOCKET_URL = 'wss://eu.rt.speechmatics.com/v2';

/** Higher accuracy at the cost of latency, which a batch job can afford. */
export const OPERATING_POINT = 'enhanced';

/** The provider rejects a temporary key request outside this range. */
export const MIN_REALTIME_KEY_TTL_SECONDS = 60;
export const MAX_REALTIME_KEY_TTL_SECONDS = 86_400;
