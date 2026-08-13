import {
  buildTranscriptText,
  interpretSpeechmaticsCallback,
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

describe('interpretSpeechmaticsCallback', () => {
  const TRANSCRIPT_BODY = JSON.stringify({
    format: '2.9',
    job: { id: 'job-1', duration: 42 },
    results: [
      word('el', 0.5),
      word('paciente', 0.9),
      word('refiere', 1.4),
      word('dolor', 1.9),
      { type: 'punctuation', end_time: 1.9, alternatives: [{ content: '.' }] },
    ],
  });

  function callbackQuery(overrides: Record<string, string | undefined> = {}): {
    query: Record<string, string | undefined>;
    body: string | undefined;
  } {
    return {
      query: {
        transcriptionId: '01ID001',
        userId: 'user-1',
        id: 'job-1',
        status: 'success',
        ...overrides,
      },
      body: TRANSCRIPT_BODY,
    };
  }

  /**
   * The whole translation, end to end: a real payload in, and platform terms
   * out. This is the assertion the webhook handler used to carry, and it lives
   * here now because the shape it depends on is one vendor's.
   */
  it('reports a success callback as a completion with the flattened text', () => {
    expect(interpretSpeechmaticsCallback(callbackQuery())).toEqual({
      kind: 'completed',
      externalJobId: 'job-1',
      text: 'el paciente refiere dolor.',
      durationSeconds: 42,
      language: null,
    });
  });

  /*
   * The other half of removing the language question from the upload screen:
   * the provider identifies the language, and this is where that answer enters
   * the platform. Without it the record would say nothing about a fact the
   * transcript is carrying.
   */
  it('reports the language the provider identified', () => {
    const body = JSON.stringify({
      job: { id: 'job-1', duration: 4 },
      results: [{ ...word('welcome', 0.5), language: 'en' }, word('back', 0.9)],
    });

    const outcome = interpretSpeechmaticsCallback({ ...callbackQuery(), body });

    expect(outcome).toMatchObject({ kind: 'completed', language: 'en' });
  });

  /*
   * The job restricts identification to the platform's five languages, so this
   * should not arrive — but the payload belongs to somebody else. An
   * unrecognised code is read as "not identified" rather than stored, because
   * a language outside the union is one the rest of the system cannot name.
   */
  it('ignores a language code the platform does not support', () => {
    const body = JSON.stringify({
      job: { id: 'job-1', duration: 4 },
      results: [{ ...word('bonjour', 0.5), language: 'fr' }],
    });

    const outcome = interpretSpeechmaticsCallback({ ...callbackQuery(), body });

    expect(outcome).toMatchObject({ kind: 'completed', language: null });
  });

  it('reports a failure status as a failure, carrying the job id and the status word', () => {
    expect(interpretSpeechmaticsCallback(callbackQuery({ status: 'error' }))).toEqual({
      kind: 'failed',
      externalJobId: 'job-1',
      providerStatus: 'error',
    });
  });

  /**
   * Guessing the other way would complete a transcription out of whatever the
   * body happened to hold. FAILED is recoverable — ruling R2 allows FAILED to
   * COMPLETED — so this is the direction that can be undone.
   */
  it('treats a status it has never seen as a failure rather than as a completion', () => {
    const outcome = interpretSpeechmaticsCallback(callbackQuery({ status: 'something-new' }));

    expect(outcome.kind).toBe('failed');
  });

  it.each([
    ['no job id', { id: undefined }],
    ['an empty job id', { id: '' }],
    ['a job id longer than the bound', { id: 'j'.repeat(129) }],
  ])('refuses to interpret a callback with %s', (_description, overrides) => {
    // Not a failure. The job id is what proves the callback belongs to the
    // record it names, so without a usable one there is nothing to check a
    // forged delivery against, and marking a transcription failed would be a
    // write the sender never earned.
    expect(interpretSpeechmaticsCallback(callbackQuery(overrides))).toEqual({
      kind: 'unrecognised',
      reason: 'The callback did not name a provider job',
    });
  });

  it.each([
    ['no status', { status: undefined }],
    ['an empty status', { status: '' }],
    ['a status longer than the bound', { status: 's'.repeat(129) }],
  ])('refuses to interpret a callback with %s', (_description, overrides) => {
    // The status reaches a log line, so its length is bounded here rather than
    // trusted because the caller knew the shared secret.
    expect(interpretSpeechmaticsCallback(callbackQuery(overrides))).toEqual({
      kind: 'unrecognised',
      reason: 'The callback did not report a job status',
    });
  });

  it.each([
    ['is not valid JSON', 'not json at all'],
    ['is JSON but not a transcript', '"a transcript"'],
    ['carries results of the wrong shape', JSON.stringify({ results: 'everything' })],
  ])('refuses to interpret a success callback whose body %s', (_description, body) => {
    expect(interpretSpeechmaticsCallback({ ...callbackQuery(), body })).toEqual({
      kind: 'unrecognised',
      reason: 'The callback body is not a transcript',
    });
  });

  /**
   * An empty recording produced no tokens, and the provider may send no body
   * for it at all. Refusing that would leave the job redelivered until the
   * provider gives up and the record stuck in PROCESSING for ever, which is a
   * worse answer than a transcription with nothing in it.
   */
  it.each([
    ['an absent body', undefined],
    ['an empty body', ''],
  ])('completes an empty recording from %s', (_description, body) => {
    expect(interpretSpeechmaticsCallback({ ...callbackQuery(), body })).toEqual({
      kind: 'completed',
      externalJobId: 'job-1',
      text: '',
      durationSeconds: 0,
      language: null,
    });
  });

  it('reads the status before the body, so a failure needs no transcript', () => {
    const outcome = interpretSpeechmaticsCallback({
      ...callbackQuery({ status: 'error' }),
      body: 'not json at all',
    });

    expect(outcome.kind).toBe('failed');
  });
});
