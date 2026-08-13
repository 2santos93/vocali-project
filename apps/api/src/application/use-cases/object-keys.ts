import type { TranscriptFormat } from '@vocali/contracts';

/**
 * The prefix every uploaded object sits under, and the first segment
 * `parseAudioObjectKey` requires. Written once so the builder and the parser
 * below cannot disagree about it — they did, from two different modules, and a
 * disagreement means an uploaded file that is never transcribed.
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
 * Reads the owning user and transcription back out of an audio object key.
 *
 * Requires at least four non-empty segments; anything shorter, or with an
 * empty segment, is rejected as unparseable rather than silently coerced.
 *
 * This is a structural check only — it does not verify that `userId` or
 * `transcriptionId` correspond to a real record, and it tolerates extra
 * segments after the file name. That verification is the caller's job: see
 * the exact-match check against the record's own `audioObjectKey` in
 * `StartFileTranscription.execute`.
 *
 * S3 event notifications percent-and-plus-encode object keys (a space
 * becomes `+`, accented characters are percent-escaped), so whatever calls
 * this with a raw S3 event key must `decodeURIComponent` it first — an
 * un-decoded key silently fails to match the stored `audioObjectKey` and the
 * file is never transcribed.
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
