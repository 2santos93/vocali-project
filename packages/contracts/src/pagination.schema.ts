import { z } from 'zod';
import { TranscriptionSchema } from './transcription.schema.js';

export const ListTranscriptionsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
});

export const ListTranscriptionsResponseSchema = z.object({
  items: z.array(TranscriptionSchema),
  nextCursor: z.string().nullable(),
});

export type ListTranscriptionsQuery = z.infer<typeof ListTranscriptionsQuerySchema>;
export type ListTranscriptionsResponse = z.infer<typeof ListTranscriptionsResponseSchema>;
