/**
 * Written out by hand rather than derived from the DTO type: a generated list
 * would grow silently the moment an internal field was added, which is the
 * leak these assertions exist to catch.
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
