import { CreateUploadIntentRequestSchema, MAX_AUDIO_FILE_SIZE_BYTES } from './index.js';

describe('CreateUploadIntentRequestSchema', () => {
  const validRequest = {
    fileName: 'consultation.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: 1_024,
    language: 'es',
  };

  it('accepts a well-formed upload request', () => {
    expect(CreateUploadIntentRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it('defaults language to "es" when omitted', () => {
    const withoutLanguage = {
      fileName: validRequest.fileName,
      contentType: validRequest.contentType,
      sizeBytes: validRequest.sizeBytes,
    };

    const parsed = CreateUploadIntentRequestSchema.parse(withoutLanguage);

    expect(parsed.language).toBe('es');
  });

  it('rejects an unsupported language code', () => {
    const result = CreateUploadIntentRequestSchema.safeParse({
      ...validRequest,
      language: 'xx',
    });

    expect(result.success).toBe(false);
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
