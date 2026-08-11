import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { AudioFile } from './audio-file.js';

describe('AudioFile', () => {
  const validInput = { fileName: 'visit.mp3', contentType: 'audio/mpeg', sizeBytes: 2_048 };

  it('is created from a supported format within the size limit', () => {
    const result = AudioFile.create(validInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.fileName).toBe('visit.mp3');
      expect(result.value.sizeBytes).toBe(2_048);
    }
  });

  it('rejects an unsupported format', () => {
    const result = AudioFile.create({ ...validInput, contentType: 'application/zip' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNSUPPORTED_AUDIO_FORMAT');
    }
  });

  it('rejects a file above the size limit', () => {
    const result = AudioFile.create({
      ...validInput,
      sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES + 1,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AUDIO_FILE_TOO_LARGE');
    }
  });

  it('accepts a file exactly at the size limit', () => {
    const result = AudioFile.create({ ...validInput, sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES });

    expect(result.success).toBe(true);
  });

  it('rejects an empty file', () => {
    const result = AudioFile.create({ ...validInput, sizeBytes: 0 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_SIZE');
    }
  });

  it('rejects a negative size', () => {
    const result = AudioFile.create({ ...validInput, sizeBytes: -1 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_SIZE');
    }
  });

  it('rejects a NaN size', () => {
    const result = AudioFile.create({ ...validInput, sizeBytes: Number.NaN });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_SIZE');
    }
  });

  it('rejects a non-integer size', () => {
    const result = AudioFile.create({ ...validInput, sizeBytes: 1.5 });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_SIZE');
    }
  });

  it('cannot be produced from a structurally similar object (nominal typing)', () => {
    function attemptToSmuggleAnUnvalidatedRow(row: {
      fileName: string;
      contentType: string;
      sizeBytes: number;
    }): AudioFile {
      // @ts-expect-error AudioFile is nominal: a plain object with matching
      // public fields is not assignable without going through `create`.
      return row;
    }

    expect(attemptToSmuggleAnUnvalidatedRow).toBeInstanceOf(Function);
  });
});
