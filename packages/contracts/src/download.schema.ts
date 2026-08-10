import { z } from 'zod';

export const TranscriptFormatSchema = z.enum(['txt', 'json']);

export const DownloadUrlResponseSchema = z.object({
  url: z.string().url(),
  format: TranscriptFormatSchema,
  expiresAt: z.string().datetime(),
});

export type TranscriptFormat = z.infer<typeof TranscriptFormatSchema>;
export type DownloadUrlResponse = z.infer<typeof DownloadUrlResponseSchema>;
