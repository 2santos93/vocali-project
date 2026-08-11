import { z } from 'zod';

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Every stable error code a domain error can carry. Kept as a plain array and
 * derived union (not a Zod schema) so the domain layer can import it: only
 * `zod` itself is off-limits there, not this package's plain re-exports.
 */
export const DOMAIN_ERROR_CODES = [
  'UNSUPPORTED_AUDIO_FORMAT',
  'INVALID_AUDIO_FILE_SIZE',
  'AUDIO_FILE_TOO_LARGE',
  'TRANSCRIPTION_NOT_FOUND',
  'INVALID_STATUS_TRANSITION',
  'TRANSCRIPTION_NOT_READY',
  'INVALID_CURSOR',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];
