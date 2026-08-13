import type { TranscriptFormat } from '@vocali/contracts';

/**
 * Written once so the builder and the parser below cannot disagree about it.
 * They did, from two different modules, and a disagreement means an uploaded
 * file that is never transcribed.
 */
const AUDIO_KEY_PREFIX = 'audio';

const AUDIO_KEY_SEGMENT_COUNT = 4;

/** Audio object keys follow `audio/{userId}/{transcriptionId}/{fileName}`. */
export function buildAudioObjectKey(
  userId: string,
  transcriptionId: string,
  fileName: string,
): string {
  return `${AUDIO_KEY_PREFIX}/${userId}/${transcriptionId}/${fileName}`;
}

/**
 * A structural check only: it does not verify the ids name a real record, and
 * it tolerates extra segments. The caller owns that — see the exact-match
 * check in `StartFileTranscription.execute`.
 *
 * S3 event notifications percent-and-plus-encode object keys, so a raw event
 * key must be `decodeURIComponent`ed before it reaches here. An un-decoded key
 * silently fails to match the stored `audioObjectKey` and the file is never
 * transcribed.
 */
export function parseAudioObjectKey(
  objectKey: string,
): { userId: string; transcriptionId: string } | null {
  const segments = objectKey.split('/');
  if (
    segments.length < AUDIO_KEY_SEGMENT_COUNT ||
    segments.some((segment) => segment.length === 0)
  ) {
    return null;
  }

  const [prefix, userId, transcriptionId] = segments;
  if (prefix !== AUDIO_KEY_PREFIX || userId === undefined || transcriptionId === undefined) {
    return null;
  }

  return { userId, transcriptionId };
}

/** Transcript object keys follow `transcripts/{userId}/{transcriptionId}.{format}`. */
export function buildTranscriptObjectKey(
  userId: string,
  transcriptionId: string,
  format: TranscriptFormat,
): string {
  return `transcripts/${userId}/${transcriptionId}.${format}`;
}
