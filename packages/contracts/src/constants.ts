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
