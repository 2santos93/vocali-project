import { z } from 'zod';
import { MAX_AUDIO_FILE_SIZE_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES } from './constants.js';

const SafeFileNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\p{C}/\\]+$/u, { message: 'File name must not contain control characters' })
  .refine((value) => !value.includes('..'), {
    message: 'File name must not contain a ".." sequence',
  });

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
