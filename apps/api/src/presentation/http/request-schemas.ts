import { TranscriptFormatSchema } from '@vocali/contracts';
import { z } from 'zod';

const MAX_TRANSCRIPTION_ID_LENGTH = 64;

export const TranscriptionPathParametersSchema = z.object({
  transcriptionId: z.string().min(1).max(MAX_TRANSCRIPTION_ID_LENGTH),
});

export const DownloadUrlQuerySchema = z.object({
  format: TranscriptFormatSchema.default('txt'),
});
