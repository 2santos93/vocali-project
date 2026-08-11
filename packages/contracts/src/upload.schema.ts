import { z } from 'zod';
import {
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  MAX_AUDIO_FILE_SIZE_BYTES,
  SUPPORTED_AUDIO_CONTENT_TYPES,
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
} from './constants.js';

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
    message: 'File name must not contain path separators',
  });

export const CreateUploadIntentRequestSchema = z.object({
  fileName: SafeFileNameSchema,
  contentType: z.enum(SUPPORTED_AUDIO_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_AUDIO_FILE_SIZE_BYTES),
  language: z.enum(SUPPORTED_TRANSCRIPTION_LANGUAGES).default(DEFAULT_TRANSCRIPTION_LANGUAGE),
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
