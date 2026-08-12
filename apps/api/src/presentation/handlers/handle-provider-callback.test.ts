import { handleProviderCallbackHandler } from './handle-provider-callback.js';
import { CompleteTranscription } from '../../application/use-cases/complete-transcription.js';
import { FailTranscription } from '../../application/use-cases/fail-transcription.js';
import { Transcription } from '../../domain/entities/transcription.js';
import { AudioFile } from '../../domain/value-objects/audio-file.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../test/builders/api-gateway-event.builder.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { FakeSecretsProvider } from '../../../test/doubles/fake-secrets-provider.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';

const NOW = new Date('2026-08-11T09:00:00.000Z');
const WEBHOOK_SECRET_NAME = '/vocali/test/speechmatics/webhook-secret';
const WEBHOOK_SECRET = 'a-long-shared-webhook-secret-value';

const TRANSCRIPT_BODY = JSON.stringify({
  format: '2.9',
  job: { id: 'job-1', duration: 42 },
  results: [
    { type: 'word', end_time: 0.5, alternatives: [{ content: 'el' }] },
    { type: 'word', end_time: 0.9, alternatives: [{ content: 'paciente' }] },
    { type: 'word', end_time: 1.4, alternatives: [{ content: 'refiere' }] },
    { type: 'word', end_time: 1.9, alternatives: [{ content: 'dolor' }] },
    { type: 'punctuation', end_time: 1.9, alternatives: [{ content: '.' }] },
  ],
});

const EXPECTED_TEXT = 'el paciente refiere dolor.';

function buildSubject(): {
  handler: ReturnType<typeof handleProviderCallbackHandler>;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
  secrets: FakeSecretsProvider;
  logger: CapturingLogger;
} {
  const clock = new FixedClock(NOW);
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage(clock);
  const secrets = new FakeSecretsProvider({ [WEBHOOK_SECRET_NAME]: WEBHOOK_SECRET });
  const logger = new CapturingLogger();

  return {
    handler: handleProviderCallbackHandler({
      completeTranscription: new CompleteTranscription(repository, storage, clock),
      failTranscription: new FailTranscription(repository, clock),
      secrets,
      webhookSecretName: WEBHOOK_SECRET_NAME,
      logger,
    }),
    repository,
    storage,
    secrets,
    logger,
  };
}

function buildCallback(options: {
  secret?: string | null;
  headerName?: string;
  status?: string;
  jobId?: string;
  transcriptionId?: string;
  userId?: string;
  body?: string;
}): ReturnType<typeof buildApiGatewayEvent> {
  const secret = options.secret === undefined ? WEBHOOK_SECRET : options.secret;

  return buildApiGatewayEvent({
    authorizer: null,
    headers: secret === null ? {} : { [options.headerName ?? 'authorization']: `Bearer ${secret}` },
    queryStringParameters: {
      transcriptionId: options.transcriptionId ?? '01ID001',
      userId: options.userId ?? 'user-1',
      id: options.jobId ?? 'job-1',
      status: options.status ?? 'success',
    },
    body: options.body ?? TRANSCRIPT_BODY,
  });
}

async function saveProcessing(repository: InMemoryTranscriptionRepository): Promise<void> {
  const transcription = buildPendingUpload();
  transcription.markAsProcessing('job-1', NOW);
  await repository.save(transcription);
}

function buildPendingUpload(): Transcription {
  const audioFile = AudioFile.create({
    fileName: 'visit.mp3',
    contentType: 'audio/mpeg',
    sizeBytes: 2_048,
  });
  if (!audioFile.success) throw new Error('fixture must be valid');

  return Transcription.createForFileUpload({
    id: '01ID001',
    userId: 'user-1',
    audioFile: audioFile.value,
    audioObjectKey: 'audio/user-1/01ID001/visit.mp3',
    language: 'es',
    createdAt: NOW,
  });
}

describe('handleProviderCallbackHandler — the shared secret', () => {
  it('accepts a callback presenting the configured secret', async () => {
    const { handler, repository, secrets } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect(secrets.requestedNames).toEqual([WEBHOOK_SECRET_NAME]);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });

  /**
   * The reject path, and the reason this handler exists in the shape it does.
   * This route has no JWT authorizer, so without the secret check anyone who
   * learns the URL can write a fabricated transcript into a named user's
   * history. Nothing may change on this path.
   */
  it('answers 401 and changes nothing for a wrong secret', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ secret: 'not-the-shared-secret-at-all-xxxx' }));

    expect(response.statusCode).toBe(401);
    expect(parseResponseBody(response.body).code).toBe('UNAUTHENTICATED');
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
  });

  it.each([
    ['no Authorization header', null],
    ['an empty credential', ''],
    ['a prefix of the real secret', WEBHOOK_SECRET.slice(0, 10)],
    ['the real secret with one character appended', `${WEBHOOK_SECRET}x`],
    ['a much longer value', 'x'.repeat(4_096)],
  ])('answers 401 for %s', async (_description, secret) => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    // A length-mismatched credential must be rejected like any other, not
    // crash: `timingSafeEqual` throws on buffers of different lengths, and
    // the obvious guard against that — comparing lengths first and returning
    // early — is exactly the leak the constant-time comparison exists to
    // avoid.
    const response = await handler(buildCallback({ secret }));

    expect(response.statusCode).toBe(401);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('accepts the credential under a capitalised header name', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ headerName: 'Authorization' }));

    expect(response.statusCode).toBe(200);
  });

  /**
   * Ordering, not just outcome. An unauthenticated caller must learn nothing
   * about the shape of the payload, so a forged callback with a nonsense
   * query string is a 401 and never a 400.
   */
  it('checks the credential before it looks at the query string or the body', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: null,
        headers: { authorization: 'Bearer wrong' },
        queryStringParameters: {},
        body: 'not json at all',
      }),
    );

    expect(response.statusCode).toBe(401);
  });

  it('does not write the rejected credential to the log', async () => {
    const { handler, repository, logger } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({ secret: 'guessed-secret-attempt-number-four' }));

    expect(logger.serialise()).not.toContain('guessed-secret-attempt-number-four');
    expect(logger.serialise()).not.toContain(WEBHOOK_SECRET);
  });
});

describe('handleProviderCallbackHandler — completion', () => {
  it('stores the flattened transcript and the reported duration', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({}));

    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(EXPECTED_TEXT);
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.toPrimitives().durationSeconds).toBe(42);
    expect(stored?.toPrimitives().textPreview).toContain('el paciente');
  });

  /**
   * The provider redelivers until it gets a 2xx. A second delivery must be
   * acknowledged, and must not overwrite a transcript that is already good —
   * COMPLETED is terminal for exactly this reason.
   */
  it('acknowledges a redelivered completion without rewriting the transcript', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({}));
    const writesAfterFirst = storage.calls.writes.length;
    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect(storage.calls.writes).toHaveLength(writesAfterFirst);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });

  /**
   * Ruling R12's recovery path. If the save that would have recorded
   * PROCESSING and the job id failed after the provider had already accepted
   * the job, the record is still PENDING_UPLOAD with a null externalJobId — a
   * lookup by job id could never find it, which is why the identity travels
   * in the callback URL instead.
   */
  it('completes a record whose job id was never persisted, and records it', async () => {
    const { handler, repository } = buildSubject();
    await repository.save(buildPendingUpload());

    const response = await handler(buildCallback({ jobId: 'job-recovered' }));

    expect(response.statusCode).toBe(200);
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().externalJobId).toBe('job-recovered');
  });

  it('answers 404 for a job id that contradicts the one on record', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ jobId: 'somebody-elses-job' }));

    expect(response.statusCode).toBe(404);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('answers 404 for a transcription that does not exist', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildCallback({ transcriptionId: '01ID404' }));

    expect(response.statusCode).toBe(404);
  });

  it('answers 400 when the query string is missing the identity we appended', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: null,
        headers: { authorization: `Bearer ${WEBHOOK_SECRET}` },
        queryStringParameters: { id: 'job-1', status: 'success' },
        body: TRANSCRIPT_BODY,
      }),
    );

    expect(response.statusCode).toBe(400);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
  });

  it('answers 400 for a success callback whose body is not a transcript', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ body: 'not json at all' }));

    expect(response.statusCode).toBe(400);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
  });
});

describe('handleProviderCallbackHandler — failure', () => {
  it('marks the record failed with a reason written for a clinician', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ status: 'error', body: '{}' }));

    expect(response.statusCode).toBe(200);
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('FAILED');
    // The provider's own vocabulary is operational detail. It goes to the log;
    // what is stored and shown says something the reader can act on.
    expect(stored?.toPrimitives().errorMessage).toBe(
      'The transcription provider could not process this recording',
    );
  });

  it('records the raw provider status in the log rather than on the record', async () => {
    const { handler, repository, logger } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({ status: 'rejected', body: '{}' }));

    expect(logger.serialise()).toContain('rejected');
    expect(
      (await repository.findById('user-1', '01ID001'))?.toPrimitives().errorMessage,
    ).not.toContain('rejected');
  });

  it('treats an unrecognised status as a failure rather than as a completion', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ status: 'something-new', body: '{}' }));

    expect(response.statusCode).toBe(200);
    // Guessing the other way would complete a transcription with whatever the
    // body happened to hold. FAILED is recoverable — ruling R2 allows
    // FAILED to COMPLETED — so this is the direction that can be undone.
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('FAILED');
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('acknowledges a redelivered failure', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({ status: 'error', body: '{}' }));
    const response = await handler(buildCallback({ status: 'error', body: '{}' }));

    expect(response.statusCode).toBe(200);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('FAILED');
  });

  it('answers 404 for a failure callback naming a transcription that does not exist', async () => {
    const { handler } = buildSubject();

    const response = await handler(
      buildCallback({ status: 'error', body: '{}', transcriptionId: '01ID404' }),
    );

    expect(response.statusCode).toBe(404);
  });

  it('does not undo a completed transcription with a late failure signal', async () => {
    const { handler, repository } = buildSubject();
    await saveProcessing(repository);
    await handler(buildCallback({}));

    const response = await handler(buildCallback({ status: 'error', body: '{}' }));

    expect(response.statusCode).toBe(200);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });
});
