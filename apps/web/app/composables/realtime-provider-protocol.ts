import type { RealtimeSessionResponse, TranscriptionLanguage } from '@vocali/contracts';
import type { ProviderFrame } from './types/ProviderFrame';

/**
 * The socket is a trust boundary: frames arrive from a third party, so every
 * field is read as `unknown` and checked. Asserting a type onto them would
 * turn a protocol change into a crash in the middle of a dictation.
 */

/** Higher accuracy at the cost of latency, which a dictation can afford. */
const OPERATING_POINT = 'enhanced';

export const CLOSE_NORMAL = 1000;
export const CLOSE_INTERNAL_ERROR = 1011;
/** The provider's own range. Documented in planning/phase-2-provider-integration-notes.md. */
export const CLOSE_NOT_AUTHORISED = 4001;
export const CLOSE_QUOTA_EXCEEDED = 4005;
export const CLOSE_JOB_ERROR = 4013;

function propertyOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) {
    return undefined;
  }
  return (source as Record<string, unknown>)[key];
}

function stringPropertyOf(source: unknown, key: string): string | null {
  const value = propertyOf(source, key);
  return typeof value === 'string' ? value : null;
}

/** Reads a frame without trusting its shape; `null` for anything unreadable. */
export function parseProviderFrame(data: unknown): ProviderFrame | null {
  if (typeof data !== 'string') {
    return null;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }
  const name = stringPropertyOf(payload, 'message');
  return name === null ? null : { name, payload };
}

/** The words a transcript frame carries, or an empty string if it carries none. */
export function transcriptOf(payload: unknown): string {
  return stringPropertyOf(propertyOf(payload, 'metadata'), 'transcript') ?? '';
}

/** Which kind of error an `Error` frame reports, as the provider spells it. */
export function errorTypeOf(payload: unknown): string | null {
  return stringPropertyOf(payload, 'type');
}

/**
 * The audio format comes from the session the API minted rather than being
 * restated here: the provider rejects a mismatch, but only once the socket is
 * open and the user has already started speaking.
 */
export function buildStartRecognition(
  audioFormat: RealtimeSessionResponse['audioFormat'],
  language: TranscriptionLanguage,
): Record<string, unknown> {
  return {
    message: 'StartRecognition',
    audio_format: {
      type: audioFormat.type,
      encoding: audioFormat.encoding,
      sample_rate: audioFormat.sampleRate,
    },
    transcription_config: {
      language,
      operating_point: OPERATING_POINT,
      enable_partials: true,
    },
  };
}

/**
 * `last_seq_no` is how the provider knows it has received everything, so it
 * counts frames actually put on the wire, not frames the microphone produced.
 */
export function buildEndOfStream(framesSent: number): Record<string, unknown> {
  return { message: 'EndOfStream', last_seq_no: framesSent };
}
