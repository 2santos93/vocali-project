import type { TranscriptFormat } from '@vocali/contracts';

/** Audio object keys follow `audio/{userId}/{transcriptionId}/{fileName}`. */
export function buildAudioObjectKey(
  userId: string,
  transcriptionId: string,
  fileName: string,
): string {
  return `audio/${userId}/${transcriptionId}/${fileName}`;
}

/** Transcript object keys follow `transcripts/{userId}/{transcriptionId}.{format}`. */
export function buildTranscriptObjectKey(
  userId: string,
  transcriptionId: string,
  format: TranscriptFormat,
): string {
  return `transcripts/${userId}/${transcriptionId}.${format}`;
}
