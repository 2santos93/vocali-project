import { CreateUploadIntentRequestSchema, MAX_AUDIO_FILE_SIZE_BYTES } from './index.js';

describe('CreateUploadIntentRequestSchema', () => {
  const validRequest = {
    fileName: 'consultation.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: 1_024,
  };

  it('accepts a well-formed upload request', () => {
    expect(CreateUploadIntentRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  /*
   * An upload no longer declares a language — the provider identifies it from
   * the audio. A client still sending one is not refused, because refusing
   * would break the previous version of the web app mid-deploy for no gain,
   * but the value goes nowhere: it is stripped here rather than reaching a
   * record that would then claim a language nobody verified.
   */
  it('ignores a language a caller still sends', () => {
    const parsed = CreateUploadIntentRequestSchema.parse({ ...validRequest, language: 'en' });

    expect(parsed).toEqual(validRequest);
    expect(parsed).not.toHaveProperty('language');
  });

  it('rejects a file larger than the maximum allowed size', () => {
    const result = CreateUploadIntentRequestSchema.safeParse({
      ...validRequest,
      sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES + 1,
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unsupported content type', () => {
    const result = CreateUploadIntentRequestSchema.safeParse({
      ...validRequest,
      contentType: 'application/pdf',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a file name that traverses directories', () => {
    const result = CreateUploadIntentRequestSchema.safeParse({
      ...validRequest,
      fileName: '../../etc/passwd',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a file name containing control characters', () => {
    const result = CreateUploadIntentRequestSchema.safeParse({
      ...validRequest,
      fileName: 'a\r\nX-Injected: 1.mp3',
    });

    expect(result.success).toBe(false);
  });
});
