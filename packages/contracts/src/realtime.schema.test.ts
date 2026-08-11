import { SaveRealtimeTranscriptionRequestSchema } from './index.js';

describe('SaveRealtimeTranscriptionRequestSchema', () => {
  const validRequest = {
    text: 'the patient reports mild pain',
    durationSeconds: 42,
    language: 'es',
  };

  it('accepts a well-formed realtime transcription', () => {
    expect(SaveRealtimeTranscriptionRequestSchema.parse(validRequest)).toEqual(validRequest);
  });

  it('defaults language to "es" when omitted', () => {
    const parsed = SaveRealtimeTranscriptionRequestSchema.parse({
      text: validRequest.text,
      durationSeconds: validRequest.durationSeconds,
    });

    expect(parsed.language).toBe('es');
  });

  it('rejects an unsupported language code, matching the upload path', () => {
    // Both entry points write to the same table and are read by the same
    // history view, so a language accepted here but rejected on upload would
    // put a value in storage that the rest of the system treats as invalid.
    // 'xx' is the exact code the upload schema rejects.
    const result = SaveRealtimeTranscriptionRequestSchema.safeParse({
      ...validRequest,
      language: 'xx',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty text, so an aborted session cannot be stored as a transcription', () => {
    const result = SaveRealtimeTranscriptionRequestSchema.safeParse({
      ...validRequest,
      text: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a negative duration', () => {
    const result = SaveRealtimeTranscriptionRequestSchema.safeParse({
      ...validRequest,
      durationSeconds: -1,
    });

    expect(result.success).toBe(false);
  });
});
