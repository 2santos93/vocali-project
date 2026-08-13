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

/**
 * The provider identifies the language of an uploaded file itself. Its own
 * word for that, and the only value `transcription_config.language` takes on
 * this platform's batch jobs.
 *
 * Batch only. The realtime websocket requires a real language code and rejects
 * this one, which is why the dictation screen still asks and the upload screen
 * no longer does.
 */
export const AUTOMATIC_LANGUAGE = 'auto';

/**
 * What identification is allowed to conclude, and what happens when it cannot
 * conclude anything.
 *
 * The candidates are exactly the languages this platform supports, so a
 * detected language is always one the rest of the system can store and name —
 * an unrestricted identifier would be free to return Portuguese for a Galician
 * recording, which is true of the audio and useless to a record whose language
 * is one of five.
 *
 * Identification wants roughly a minute of speech to be reliable, and clinical
 * audio is often shorter than that. `use_default_language` is what makes a
 * short file behave exactly as it did when the screen asked and defaulted to
 * Spanish, rather than failing the job outright.
 */
export const LANGUAGE_IDENTIFICATION_LOW_CONFIDENCE_ACTION = 'use_default_language';

/** The provider rejects a temporary key request outside this range. */
export const MIN_REALTIME_KEY_TTL_SECONDS = 60;
export const MAX_REALTIME_KEY_TTL_SECONDS = 86_400;
