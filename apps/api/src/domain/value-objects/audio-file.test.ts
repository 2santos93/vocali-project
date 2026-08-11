import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts/constants';
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

  it('accepts a Spanish file name with spaces and accents', () => {
    const result = AudioFile.create({ ...validInput, fileName: 'informe radiología.mp3' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.fileName).toBe('informe radiología.mp3');
    }
  });

  it('rejects an empty file name', () => {
    const result = AudioFile.create({ ...validInput, fileName: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
  });

  it('rejects a file name longer than 255 characters', () => {
    const result = AudioFile.create({ ...validInput, fileName: `${'a'.repeat(252)}.mp3` });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
  });

  it('accepts a file name of exactly 255 characters', () => {
    const result = AudioFile.create({ ...validInput, fileName: `${'a'.repeat(251)}.mp3` });

    expect(result.success).toBe(true);
  });

  it('rejects a file name containing a control character', () => {
    // A CRLF here would end up in a Content-Disposition response header.
    const result = AudioFile.create({ ...validInput, fileName: 'visit\r\n.mp3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
  });

  it('rejects a file name containing a forward slash', () => {
    const result = AudioFile.create({ ...validInput, fileName: 'sub/visit.mp3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
  });

  it('rejects a file name containing a backslash', () => {
    const result = AudioFile.create({ ...validInput, fileName: 'sub\\visit.mp3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
  });

  it('rejects a traversal sequence in the file name', () => {
    // `buildAudioObjectKey` interpolates the name straight into the S3 key.
    // S3 keys are opaque and do not resolve `..`, so this does not escape the
    // user's prefix today — but the guarantee this class states is that no
    // AudioFile can carry a name the platform does not accept.
    const result = AudioFile.create({
      ...validInput,
      fileName: '../../user-2/01B/evil.mp3',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
    }
  });

  it('rejects a ".." sequence carrying no path separator of its own', () => {
    // The traversal case above is also caught by the separator rule, so it
    // cannot show that the `..` rule does anything. This name can only be
    // rejected by that rule, which is what makes it the one that pins it.
    const result = AudioFile.create({ ...validInput, fileName: 'visit..mp3' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_AUDIO_FILE_NAME');
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
