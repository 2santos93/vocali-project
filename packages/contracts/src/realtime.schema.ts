import { z } from 'zod';
import {
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  REALTIME_AUDIO_FORMAT,
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
} from './constants.js';

export const RealtimeSessionResponseSchema = z.object({
  token: z.string().min(1),
  websocketUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  // Built from REALTIME_AUDIO_FORMAT rather than restated, so the schema, the
  // session the API mints and the rate the browser captures at cannot drift.
  audioFormat: z.object({
    type: z.literal(REALTIME_AUDIO_FORMAT.type),
    encoding: z.literal(REALTIME_AUDIO_FORMAT.encoding),
    sampleRate: z.literal(REALTIME_AUDIO_FORMAT.sampleRate),
  }),
});

export const SaveRealtimeTranscriptionRequestSchema = z.object({
  text: z.string().min(1).max(500_000),
  durationSeconds: z.number().nonnegative(),
  language: z.enum(SUPPORTED_TRANSCRIPTION_LANGUAGES).default(DEFAULT_TRANSCRIPTION_LANGUAGE),
  /**
   * An idempotency key the client mints once per dictation and repeats on
   * every retry of the same save.
   *
   * This is the one write path the user's own browser posts to, and a retry
   * after a committed-but-unacknowledged write would otherwise put two
   * identical transcriptions in the history — indistinguishable from each
   * other and impossible to merge. On a phone, in a clinic, on hospital wifi,
   * that retry is not hypothetical.
   *
   * Optional so a client that has not adopted it still works, and never the
   * record's id: ids are ULIDs so that sort-key order is chronological order,
   * and a client-chosen id destroys the property the history query depends on.
   */
  clientSessionId: z.string().min(1).max(64).optional(),
});

export type RealtimeSessionResponse = z.infer<typeof RealtimeSessionResponseSchema>;
export type SaveRealtimeTranscriptionRequest = z.infer<
  typeof SaveRealtimeTranscriptionRequestSchema
>;
