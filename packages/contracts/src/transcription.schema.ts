import { z } from 'zod';
import {
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
  TRANSCRIPTION_SOURCES,
  TRANSCRIPTION_STATUSES,
} from './constants.js';

export const TranscriptionSourceSchema = z.enum(TRANSCRIPTION_SOURCES);

export const TranscriptionStatusSchema = z.enum(TRANSCRIPTION_STATUSES);

export const TranscriptionSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  source: TranscriptionSourceSchema,
  status: TranscriptionStatusSchema,
  /**
   * The language of the audio, once it is known.
   *
   * Null while an uploaded file is still on its way through the provider:
   * nobody declares it any more, so until the transcript comes back with the
   * language it was identified as, the honest answer is that we do not know.
   * A dictation is never null — the speaker chose it before the session
   * opened.
   */
  language: z.enum(SUPPORTED_TRANSCRIPTION_LANGUAGES).nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  sizeBytes: z.number().nonnegative().nullable(),
  textPreview: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Transcription = z.infer<typeof TranscriptionSchema>;
