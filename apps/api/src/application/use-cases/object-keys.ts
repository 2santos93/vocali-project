import type { TranscriptFormat } from '@vocali/contracts';

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
