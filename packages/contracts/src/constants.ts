/**
 * The Zod-free entry point, published separately as `@vocali/contracts/constants`.
 *
 * The domain layer imports from here and nowhere else in this package. The
 * package barrel re-exports every schema module, each of which imports Zod, so
 * a domain import of `@vocali/contracts` would pull Zod into the domain's
 * runtime module graph — quietly, since the ESLint rule can only ban the
 * literal specifier `'zod'`, which the domain never writes.
 *
 * Nothing in this file may import Zod. The schemas build their enums from
 * these arrays, so the two cannot drift apart.
 */

export const MAX_AUDIO_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export const TRANSCRIPTION_PAGE_SIZE = 10;

export const SUPPORTED_AUDIO_CONTENT_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/amr',
  'video/mp4',
] as const;

/** The platform is Spanish-first; every code here is one the provider accepts. */
export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'es';

export const SUPPORTED_TRANSCRIPTION_LANGUAGES = ['es', 'en', 'ca', 'eu', 'gl'] as const;

export type TranscriptionLanguage = (typeof SUPPORTED_TRANSCRIPTION_LANGUAGES)[number];

export const TRANSCRIPTION_SOURCES = ['FILE', 'MICROPHONE'] as const;

export type TranscriptionSource = (typeof TRANSCRIPTION_SOURCES)[number];

export const TRANSCRIPTION_STATUSES = [
  'PENDING_UPLOAD',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
] as const;

export type TranscriptionStatus = (typeof TRANSCRIPTION_STATUSES)[number];

/** Every stable error code a domain error can carry. */
export const DOMAIN_ERROR_CODES = [
  'UNSUPPORTED_AUDIO_FORMAT',
  'INVALID_AUDIO_FILE_SIZE',
  'AUDIO_FILE_TOO_LARGE',
  'INVALID_AUDIO_FILE_NAME',
  'TRANSCRIPTION_NOT_FOUND',
  'INVALID_STATUS_TRANSITION',
  'TRANSCRIPTION_NOT_READY',
  'INVALID_CURSOR',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];
