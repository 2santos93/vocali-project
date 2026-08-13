import { z } from 'zod';
import { MAX_AUDIO_FILE_SIZE_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES } from './constants.js';

/**
 * Rejects path separators so a crafted name cannot escape its storage prefix,
 * and rejects Unicode control characters so a crafted name cannot inject
 * headers (for example a CRLF sequence) into a downstream S3 object key or
 * Content-Disposition response header.
 */
const SafeFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\p{C}/\\]+$/u, { message: 'File name must not contain control characters' })
  .refine((value) => !value.includes('..'), {
    message: 'File name must not contain a ".." sequence',
  });

/**
 * No language. An uploaded recording is identified by the provider rather than
 * declared by the person uploading it: they may not have made the recording,
 * the interface's own default was wrong more often than it was right, and
 * nothing on the screen could tell the difference. The realtime request still
 * carries one, because a live session has no audio to identify yet — and
 * because the provider's websocket requires it.
 */
export const CreateUploadIntentRequestSchema = z.object({
  fileName: SafeFileNameSchema,
  contentType: z.enum(SUPPORTED_AUDIO_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_FILE_SIZE_BYTES),
});

export const CreateUploadIntentResponseSchema = z.object({
  transcriptionId: z.string().min(1),
  upload: z.object({
    url: z.string().url(),
    fields: z.record(z.string()),
    expiresAt: z.string().datetime(),
  }),
});

export type CreateUploadIntentRequest = z.infer<typeof CreateUploadIntentRequestSchema>;
export type CreateUploadIntentResponse = z.infer<typeof CreateUploadIntentResponseSchema>;
