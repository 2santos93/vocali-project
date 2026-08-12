import {
  buildTranscriptText,
  resolveDurationSeconds,
  SpeechmaticsTranscriptSchema,
} from './speechmatics-callback.js';

function word(
  content: string,
  endTime = 0,
): { type: string; end_time: number; alternatives: { content: string }[] } {
  return { type: 'word', end_time: endTime, alternatives: [{ content }] };
}

describe('buildTranscriptText', () => {
  it('separates words with a single space', () => {
    expect(buildTranscriptText([word('el'), word('paciente'), word('refiere')])).toBe(
      'el paciente refiere',
    );
  });

  it('attaches punctuation to the word before it', () => {
    const results = [
      word('dolor'),
      { type: 'punctuation', alternatives: [{ content: ',' }] },
      word('agudo'),
      { type: 'punctuation', alternatives: [{ content: '.' }] },
    ];

    expect(buildTranscriptText(results)).toBe('dolor, agudo.');
  });

  /**
   * Spanish opens a question with `¿`, which the provider marks as attaching
   * to the token that follows. Joining every token with a space would produce
   * `¿ duele ?`, which is what a clinician would be asked to sign.
   */
  it('attaches an opening question mark to the word after it', () => {
    const results = [
      { type: 'punctuation', attaches_to: 'next', alternatives: [{ content: '¿' }] },
      word('le'),
      word('duele'),
      { type: 'punctuation', attaches_to: 'previous', alternatives: [{ content: '?' }] },
    ];

    expect(buildTranscriptText(results)).toBe('¿le duele?');
  });

  it('places an opening mark after a space when it follows other text', () => {
    const results = [
      word('bien'),
      { type: 'punctuation', attaches_to: 'previous', alternatives: [{ content: '.' }] },
      { type: 'punctuation', attaches_to: 'next', alternatives: [{ content: '¿' }] },
      word('duele'),
    ];

    expect(buildTranscriptText(results)).toBe('bien. ¿duele');
  });

  it('ignores a token with no alternatives without leaving a stray space', () => {
    const results = [word('el'), { type: 'speaker_change' }, word('paciente')];

    expect(buildTranscriptText(results)).toBe('el paciente');
  });

  it("uses only the provider's first alternative", () => {
    const results = [
      { type: 'word', alternatives: [{ content: 'disnea' }, { content: 'dispnea' }] },
    ];

    expect(buildTranscriptText(results)).toBe('disnea');
  });

  it('returns an empty string for an empty result list', () => {
    expect(buildTranscriptText([])).toBe('');
  });
});

describe('resolveDurationSeconds', () => {
  it('prefers the duration the provider reported', () => {
    const transcript = SpeechmaticsTranscriptSchema.parse({
      job: { duration: 128 },
      results: [{ type: 'word', end_time: 4, alternatives: [{ content: 'hola' }] }],
    });

    expect(resolveDurationSeconds(transcript)).toBe(128);
  });

  it("falls back to the last token's end time when no duration was reported", () => {
    const transcript = SpeechmaticsTranscriptSchema.parse({
      results: [
        { type: 'word', end_time: 4.2, alternatives: [{ content: 'hola' }] },
        { type: 'word', end_time: 9.75, alternatives: [{ content: 'adios' }] },
      ],
    });

    expect(resolveDurationSeconds(transcript)).toBe(9.75);
  });

  it('reports zero for a recording that produced nothing', () => {
    expect(resolveDurationSeconds(SpeechmaticsTranscriptSchema.parse({ results: [] }))).toBe(0);
  });
});

describe('SpeechmaticsTranscriptSchema', () => {
  it('accepts a payload carrying fields the platform does not read', () => {
    const parsed = SpeechmaticsTranscriptSchema.safeParse({
      format: '2.9',
      metadata: { type: 'transcription' },
      job: { id: 'job-1', duration: 12, data_name: 'visit.mp3' },
      results: [
        {
          type: 'word',
          start_time: 0.1,
          end_time: 0.4,
          channel: 'channel_1',
          alternatives: [{ content: 'hola', confidence: 0.98, language: 'es' }],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it('defaults results to an empty list rather than rejecting the callback', () => {
    const parsed = SpeechmaticsTranscriptSchema.safeParse({ job: { duration: 0 } });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.results).toEqual([]);
  });

  it('rejects a body that is not an object at all', () => {
    expect(SpeechmaticsTranscriptSchema.safeParse('a transcript').success).toBe(false);
  });
});
