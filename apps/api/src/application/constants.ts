/**
 * How long each credential this layer hands out stays usable.
 *
 * Every one of these is a security decision rather than a tuning knob: a
 * presigned URL is a bearer credential for one object, and a realtime token is
 * a bearer credential for the provider's socket. Gathered here so the answer to
 * "how long is anything we sign valid for?" is one file rather than four use
 * cases, and so that lengthening one of them is a visible act.
 *
 * Not read from the environment, deliberately. These bound an exposure window;
 * a deployment that could widen it from a console variable is a deployment
 * where the bound is a suggestion.
 *
 * Two of these lifetimes are pinned by tests that assert the number as a
 * literal rather than importing it from here. That is intentional and is
 * explained at those assertions.
 */

/** How long the presigned POST stays valid before the client must retry. */
export const UPLOAD_URL_TTL_SECONDS = 900;

/** How long a download link stays valid before the client must request a new one. */
export const DOWNLOAD_URL_TTL_SECONDS = 900;

/** The provider needs long enough to fetch the audio, but no longer than necessary. */
export const AUDIO_READ_URL_TTL_SECONDS = 3_600;

/** Kept short: the credential is exchanged for a websocket connection immediately after issuance. */
export const REALTIME_SESSION_TTL_SECONDS = 60;
