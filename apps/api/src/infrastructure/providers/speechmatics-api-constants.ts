/**
 * The EU regional hosts, matching the `eu-west-1` deployment so clinical audio
 * stays in the same jurisdiction as the rest of the platform.
 */
export const BATCH_JOBS_URL = 'https://eu1.asr.api.speechmatics.com/v2/jobs/';
export const TEMPORARY_KEY_URL = 'https://mp.speechmatics.com/v1/api_keys?type=rt';
export const REALTIME_WEBSOCKET_URL = 'wss://eu.rt.speechmatics.com/v2';

/** Higher accuracy at the cost of latency, which a batch job can afford. */
export const OPERATING_POINT = 'enhanced';

/**
 * Batch only. The realtime websocket requires a real language code and rejects
 * this one, which is why the dictation screen still asks for a language and the
 * upload screen no longer does.
 */
export const AUTOMATIC_LANGUAGE = 'auto';

/**
 * Identification wants roughly a minute of speech to be reliable, and clinical
 * audio is often shorter. This makes a short file fall back to the default
 * language rather than failing the job outright.
 */
export const LANGUAGE_IDENTIFICATION_LOW_CONFIDENCE_ACTION = 'use_default_language';

/** The provider rejects a temporary key request outside this range. */
export const MIN_REALTIME_KEY_TTL_SECONDS = 60;
export const MAX_REALTIME_KEY_TTL_SECONDS = 86_400;
