/**
 * The exact field set a transcription may expose to a client, written out by
 * hand rather than derived from the DTO type — a list generated from the type
 * would grow silently the moment an internal field was added to it, which is
 * the leak these assertions exist to catch.
 *
 * Shared by every use case that returns a transcription, so the two paths
 * cannot drift into disagreeing about what is public.
 */
export const PUBLIC_TRANSCRIPTION_FIELDS = [
  'id',
  'fileName',
  'source',
  'status',
  'language',
  'durationSeconds',
  'sizeBytes',
  'textPreview',
  'errorMessage',
  'createdAt',
  'updatedAt',
].sort();
