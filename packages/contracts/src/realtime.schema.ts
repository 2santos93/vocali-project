import { z } from 'zod';
import { DEFAULT_TRANSCRIPTION_LANGUAGE, SUPPORTED_TRANSCRIPTION_LANGUAGES } from './constants.js';

export const RealtimeSessionResponseSchema = z.object({
  token: z.string().min(1),
  websocketUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  audioFormat: z.object({
    type: z.literal('raw'),
    encoding: z.literal('pcm_s16le'),
    sampleRate: z.literal(16_000),
  }),
});

export const SaveRealtimeTranscriptionRequestSchema = z.object({
  text: z.string().min(1).max(500_000),
  durationSeconds: z.number().nonnegative(),
  language: z.enum(SUPPORTED_TRANSCRIPTION_LANGUAGES).default(DEFAULT_TRANSCRIPTION_LANGUAGE),
});

export type RealtimeSessionResponse = z.infer<typeof RealtimeSessionResponseSchema>;
export type SaveRealtimeTranscriptionRequest = z.infer<
  typeof SaveRealtimeTranscriptionRequestSchema
>;
