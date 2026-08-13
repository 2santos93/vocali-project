import { z } from 'zod';
import { TRANSCRIPTION_UPDATE_EVENT } from './constants.js';
import { TranscriptionSchema } from './transcription.schema.js';

export const ConnectionTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  websocketUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

export const TranscriptionUpdateEventSchema = z.object({
  type: z.literal(TRANSCRIPTION_UPDATE_EVENT),
  transcription: TranscriptionSchema,
});

export type ConnectionTicketResponse = z.infer<typeof ConnectionTicketResponseSchema>;
export type TranscriptionUpdateEvent = z.infer<typeof TranscriptionUpdateEventSchema>;
