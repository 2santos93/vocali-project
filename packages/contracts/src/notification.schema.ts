import { z } from 'zod';
import { TRANSCRIPTION_UPDATE_EVENT } from './constants.js';
import { TranscriptionSchema } from './transcription.schema.js';

/**
 * What `POST /connection-tickets` hands back.
 *
 * `ticket` is a bearer credential and is the only thing the browser puts in
 * the socket's query string. It is deliberately *not* the access token: a
 * query string is written to the API's access log verbatim, and a log line
 * holding a ticket holds something that is expired, already spent, or both.
 *
 * `websocketUrl` is returned rather than configured into the front end for the
 * same reason `RealtimeSessionResponse` returns the provider's: the endpoint
 * is a deployment fact, and a second copy of it in the client is a second
 * thing to change when the stack moves.
 */
export const ConnectionTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  websocketUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});

/**
 * The one message this platform pushes down the socket.
 *
 * It carries the whole public transcription rather than an id and a status,
 * so a client that receives it needs no follow-up request — which is the
 * entire point of replacing the poll. `type` is a discriminator because a
 * socket is a stream of unrelated messages by nature, and a client that
 * assumed every frame was this one would break on the first frame that is not.
 */
export const TranscriptionUpdateEventSchema = z.object({
  type: z.literal(TRANSCRIPTION_UPDATE_EVENT),
  transcription: TranscriptionSchema,
});

export type ConnectionTicketResponse = z.infer<typeof ConnectionTicketResponseSchema>;
export type TranscriptionUpdateEvent = z.infer<typeof TranscriptionUpdateEventSchema>;
