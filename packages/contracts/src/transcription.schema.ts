import { z } from 'zod';

export const TranscriptionSourceSchema = z.enum(['FILE', 'MICROPHONE']);

export const TranscriptionStatusSchema = z.enum([
  'PENDING_UPLOAD',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const TranscriptionSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  source: TranscriptionSourceSchema,
  status: TranscriptionStatusSchema,
  language: z.string().min(2),
  durationSeconds: z.number().nonnegative().nullable(),
  sizeBytes: z.number().nonnegative().nullable(),
  textPreview: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TranscriptionSource = z.infer<typeof TranscriptionSourceSchema>;
export type TranscriptionStatus = z.infer<typeof TranscriptionStatusSchema>;
export type Transcription = z.infer<typeof TranscriptionSchema>;
