import { PublishTranscriptionUpdate } from '../../../application/use-cases/publish-transcription-update.js';
import { InMemoryConnectionRegistry } from '../../../../test-support/doubles/in-memory-connection-registry.js';
import { RecordingConnectionPublisher } from '../../../../test-support/doubles/recording-connection-publisher.js';
import { handleProviderCallbackHandler } from '../handle-provider-callback.js';
import { CompleteTranscription } from '../../../application/use-cases/complete-transcription.js';
import { FailTranscription } from '../../../application/use-cases/fail-transcription.js';
import { Transcription } from '../../../domain/entities/transcription.js';
import type { ProviderJobOutcome } from '../../../domain/types/provider.js';
import { AudioFile } from '../../../domain/value-objects/audio-file.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../../test-support/builders/api-gateway-event.builder.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FakeSecretsProvider } from '../../../../test-support/doubles/fake-secrets-provider.js';
import { FakeTranscriptionProvider } from '../../../../test-support/doubles/fake-transcription-provider.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { InMemoryFileStorage } from '../../../../test-support/doubles/in-memory-file-storage.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';

const TRANSCRIPTS_BUCKET = 'transcripts-bucket';

const NOW = new Date('2026-08-11T09:00:00.000Z');
const WEBHOOK_SECRET_NAME = '/vocali/test/speechmatics/webhook-secret';
const WEBHOOK_SECRET = 'a-long-shared-webhook-secret-value';

/**
 * Opaque on purpose: this handler is correct only if it can carry a body it
 * cannot read, so nothing below asserts the shape of this string — only that
 * it reaches the provider adapter unchanged. The real payload is pinned in
 * `infrastructure/providers/speechmatics-callback.test.ts`.
 */
const CALLBACK_BODY = '{"whatever":"the provider chose to post"}';

const TRANSCRIPT_TEXT = 'el paciente refiere dolor.';

function completed(overrides: Partial<Omit<CompletedOutcome, 'kind'>> = {}): ProviderJobOutcome {
  return {
    kind: 'completed',
    externalJobId: 'job-1',
    text: TRANSCRIPT_TEXT,
    durationSeconds: 42,
    language: null,
    ...overrides,
  };
}

type CompletedOutcome = Extract<ProviderJobOutcome, { kind: 'completed' }>;

function failed(providerStatus = 'error'): ProviderJobOutcome {
  return { kind: 'failed', externalJobId: 'job-1', providerStatus };
}

function buildSubject(): {
  handler: ReturnType<typeof handleProviderCallbackHandler>;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
  secrets: FakeSecretsProvider;
  provider: FakeTranscriptionProvider;
  connections: InMemoryConnectionRegistry;
  publisher: RecordingConnectionPublisher;
  logger: CapturingLogger;
} {
  const clock = new FixedClock(NOW);
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage({ bucketName: TRANSCRIPTS_BUCKET, clock });
  const secrets = new FakeSecretsProvider({ [WEBHOOK_SECRET_NAME]: WEBHOOK_SECRET });
  const provider = new FakeTranscriptionProvider(clock);
  const connections = new InMemoryConnectionRegistry();
  const publisher = new RecordingConnectionPublisher();
  const logger = new CapturingLogger();

  // Completion is the common case, so it is the default; every test that means
  // something else stages it. Nothing is staged implicitly — an unstaged
  // provider answers `unrecognised`, which writes nothing at all.
  provider.nextCallbackOutcome = completed();

  return {
    handler: handleProviderCallbackHandler({
      completeTranscription: new CompleteTranscription(repository, storage, clock),
      failTranscription: new FailTranscription(repository, clock),
      publishTranscriptionUpdate: new PublishTranscriptionUpdate(
        repository,
        connections,
        publisher,
        logger,
      ),
      transcriptionProvider: provider,
      secrets,
      webhookSecretName: WEBHOOK_SECRET_NAME,
      logger,
    }),
    repository,
    storage,
    secrets,
    provider,
    connections,
    publisher,
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
  requestId?: string;
}): ReturnType<typeof buildApiGatewayEvent> {
  const secret = options.secret === undefined ? WEBHOOK_SECRET : options.secret;

  return buildApiGatewayEvent({
    authorizer: null,
    ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    headers: secret === null ? {} : { [options.headerName ?? 'authorization']: `Bearer ${secret}` },
    queryStringParameters: {
      transcriptionId: options.transcriptionId ?? '01ID001',
      userId: options.userId ?? 'user-1',
      id: options.jobId ?? 'job-1',
      status: options.status ?? 'success',
    },
    body: options.body ?? CALLBACK_BODY,
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
   * This route has no JWT authorizer, so without the secret check anyone who
   * learns the URL can write a fabricated transcript into a named user's
   * history. Nothing may change on this path.
   */
  it('answers 401 and changes nothing for a wrong secret', async () => {
    const { handler, repository, storage, provider } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ secret: 'not-the-shared-secret-at-all-xxxx' }));

    expect(response.statusCode).toBe(401);
    expect(parseResponseBody(response.body).code).toBe('UNAUTHENTICATED');
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
    // Not even read. An unauthenticated body is attacker-controlled input, and
    // handing it to a parser is work done on behalf of someone who has proved
    // nothing.
    expect(provider.interpretedCallbacks).toHaveLength(0);
  });

  it('correlates the lines it writes with the request id the caller is given', async () => {
    const { handler, logger } = buildSubject();

    const response = await handler(
      buildCallback({ secret: 'not-the-shared-secret-at-all-xxxx', requestId: 'request-77' }),
    );

    // Asserted end to end through the handler rather than on the logger: the
    // correlation is only real if the middleware binds it and the handler uses
    // what it was handed.
    expect(parseResponseBody(response.body).requestId).toBe('request-77');
    expect(logger.entries).toEqual([
      {
        level: 'warn',
        message: 'Rejected a provider callback with an invalid credential',
        context: { requestId: 'request-77' },
      },
    ]);
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

    // A length-mismatched credential must be rejected, not crash:
    // `timingSafeEqual` throws on buffers of different lengths, and the
    // obvious guard — comparing lengths first — is exactly the leak the
    // constant-time comparison exists to avoid.
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

describe('handleProviderCallbackHandler — asking the provider what the callback meant', () => {
  /**
   * The handler reads only the two parameters it appended itself and passes
   * the rest on untouched. Picking out the provider's own parameters would
   * mean editing this route — the one carrying the shared-secret check — every
   * time the provider changed.
   */
  it('hands the provider the query and the body exactly as they arrived', async () => {
    const { handler, repository, provider } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({ jobId: 'job-1', status: 'success' }));

    expect(provider.interpretedCallbacks).toEqual([
      {
        query: {
          transcriptionId: '01ID001',
          userId: 'user-1',
          id: 'job-1',
          status: 'success',
        },
        body: CALLBACK_BODY,
      },
    ]);
  });

  /**
   * API Gateway base64-encodes a body whenever the content type is not on its
   * text list. Undoing that is this layer's job, and an adapter handed the
   * encoded form rejects a perfectly good transcript as unparseable.
   */
  it('decodes a base64 body before handing it over', async () => {
    const { handler, repository, provider } = buildSubject();
    await saveProcessing(repository);

    await handler(
      buildApiGatewayEvent({
        authorizer: null,
        headers: { authorization: `Bearer ${WEBHOOK_SECRET}` },
        queryStringParameters: { transcriptionId: '01ID001', userId: 'user-1' },
        body: Buffer.from(CALLBACK_BODY, 'utf8').toString('base64'),
        isBase64Encoded: true,
      }),
    );

    expect(provider.interpretedCallbacks[0]?.body).toBe(CALLBACK_BODY);
  });

  it('answers 400 and writes nothing when the provider cannot interpret the callback', async () => {
    const { handler, repository, storage, provider } = buildSubject();
    await saveProcessing(repository);
    provider.nextCallbackOutcome = {
      kind: 'unrecognised',
      reason: 'The callback body is not a transcript',
    };

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response.body).message).toBe('The callback body is not a transcript');
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('answers 400 when the query string is missing the identity we appended', async () => {
    const { handler, repository, provider } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: null,
        headers: { authorization: `Bearer ${WEBHOOK_SECRET}` },
        queryStringParameters: { id: 'job-1', status: 'success' },
        body: CALLBACK_BODY,
      }),
    );

    expect(response.statusCode).toBe(400);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    // Ours are checked first: without a record to address there is nothing for
    // an interpretation to be applied to.
    expect(provider.interpretedCallbacks).toHaveLength(0);
  });
});

describe('handleProviderCallbackHandler — completion', () => {
  it('stores the text and the duration the provider reported', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({}));

    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(TRANSCRIPT_TEXT);
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
   * The orphan recovery path. If the save that would have recorded PROCESSING
   * failed after the provider accepted the job, the record is still
   * PENDING_UPLOAD with a null externalJobId, and a lookup by job id could
   * never find it — which is why the identity travels in the callback URL.
   */
  it('completes a record whose job id was never persisted, and records it', async () => {
    const { handler, repository, provider } = buildSubject();
    await repository.save(buildPendingUpload());
    provider.nextCallbackOutcome = completed({ externalJobId: 'job-recovered' });

    // The two differ here on purpose: what is recorded has to be the id the
    // provider's adapter reported, not a parameter this layer picked out of
    // the URL, and reading the wrong one must be visible.
    const response = await handler(buildCallback({ jobId: 'job-1' }));

    expect(response.statusCode).toBe(200);
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().externalJobId).toBe('job-recovered');
  });

  it('answers 404 for a job id that contradicts the one on record', async () => {
    const { handler, repository, storage, provider } = buildSubject();
    await saveProcessing(repository);
    provider.nextCallbackOutcome = completed({ externalJobId: 'somebody-elses-job' });

    // The query names the job the record is expecting and the interpretation
    // does not. A handler that trusted the query string would answer 200 and
    // write a stranger's transcript into this user's history.
    const response = await handler(buildCallback({ jobId: 'job-1' }));

    expect(response.statusCode).toBe(404);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('answers 404 for a transcription that does not exist', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildCallback({ transcriptionId: '01ID404' }));

    expect(response.statusCode).toBe(404);
  });
});

describe('handleProviderCallbackHandler — failure', () => {
  it('marks the record failed with a reason written for a clinician', async () => {
    const { handler, repository, provider } = buildSubject();
    await saveProcessing(repository);
    provider.nextCallbackOutcome = failed();

    const response = await handler(buildCallback({ status: 'error' }));

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
    const { handler, repository, provider, logger } = buildSubject();
    await saveProcessing(repository);
    provider.nextCallbackOutcome = failed('rejected');

    await handler(buildCallback({ status: 'rejected' }));

    expect(logger.serialise()).toContain('rejected');
    expect(
      (await repository.findById('user-1', '01ID001'))?.toPrimitives().errorMessage,
    ).not.toContain('rejected');
  });

  it('acknowledges a redelivered failure', async () => {
    const { handler, repository, provider } = buildSubject();
    await saveProcessing(repository);
    provider.nextCallbackOutcome = failed();

    await handler(buildCallback({ status: 'error' }));
    const response = await handler(buildCallback({ status: 'error' }));

    expect(response.statusCode).toBe(200);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('FAILED');
  });

  it('answers 404 for a failure callback naming a transcription that does not exist', async () => {
    const { handler, provider } = buildSubject();
    provider.nextCallbackOutcome = failed();

    const response = await handler(buildCallback({ status: 'error', transcriptionId: '01ID404' }));

    expect(response.statusCode).toBe(404);
  });

  it('does not undo a completed transcription with a late failure signal', async () => {
    const { handler, repository, provider } = buildSubject();
    await saveProcessing(repository);
    await handler(buildCallback({}));

    provider.nextCallbackOutcome = failed();
    const response = await handler(buildCallback({ status: 'error' }));

    expect(response.statusCode).toBe(200);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });
});

/** The id and status of the first pushed transcription, for the assertions below. */
function readPushedTranscription(publisher: RecordingConnectionPublisher): {
  id: string;
  status: string;
} {
  const payload = publisher.calls[0]?.payload as {
    type: string;
    transcription: { id: string; status: string };
  };
  // The discriminator is checked here so every caller gets it for free: a
  // payload with the right transcription under the wrong `type` is silently
  // ignored by the browser, which is indistinguishable from no push at all.
  expect(payload.type).toBe('transcription.updated');

  return { id: payload.transcription.id, status: payload.transcription.status };
}

describe('handleProviderCallbackHandler — announcing the outcome', () => {
  it('pushes the settled transcription to the sockets its owner has open', async () => {
    const { handler, repository, connections, publisher } = buildSubject();
    await saveProcessing(repository);
    await connections.add({ userId: 'user-1', connectionId: 'connection-a', expiresAt: NOW });

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect(publisher.calls).toHaveLength(1);
    expect(publisher.calls[0]?.connectionId).toBe('connection-a');
    expect(readPushedTranscription(publisher)).toEqual({ id: '01ID001', status: 'COMPLETED' });
  });

  it('pushes a failure too, so a waiting client is not left to time out', async () => {
    const { handler, repository, provider, connections, publisher } = buildSubject();
    await saveProcessing(repository);
    await connections.add({ userId: 'user-1', connectionId: 'connection-a', expiresAt: NOW });
    provider.nextCallbackOutcome = failed();

    const response = await handler(buildCallback({ status: 'error' }));

    expect(response.statusCode).toBe(200);
    expect(readPushedTranscription(publisher)).toEqual({ id: '01ID001', status: 'FAILED' });
  });

  /*
   * The common shape of this platform is a user who uploads and closes the
   * tab. A completion with nowhere to be delivered answering anything but 2xx
   * would be redelivered and, if the condition persisted, eventually abandoned
   * — for a transcription that was already written and stored.
   */
  it('acknowledges a completion when the user has no connection open', async () => {
    const { handler, repository, publisher } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect(publisher.calls).toEqual([]);
    // The record is still written. The push is a notification; this is the
    // source of truth the client falls back to reading.
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });

  /*
   * The same guarantee under the harsher condition: the push machinery is
   * broken rather than merely unused. A browser that closed its laptop lid,
   * or a management API being throttled, must not turn a finished
   * transcription into one the provider believes was never delivered.
   */
  it('still acknowledges when the push itself fails outright', async () => {
    const { handler, repository, connections, publisher } = buildSubject();
    await saveProcessing(repository);
    await connections.add({ userId: 'user-1', connectionId: 'connection-a', expiresAt: NOW });
    publisher.failNextWith = new Error('rate exceeded');

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });

  it('still acknowledges when the registry cannot even be read', async () => {
    const { handler, repository, connections } = buildSubject();
    await saveProcessing(repository);
    connections.failNextWith = new Error('table unavailable');

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });

  it('cleans up a connection that has gone away', async () => {
    const { handler, repository, connections, publisher } = buildSubject();
    await saveProcessing(repository);
    await connections.add({ userId: 'user-1', connectionId: 'departed', expiresAt: NOW });
    publisher.goneConnectionIds.add('departed');

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect(await connections.listByUser('user-1')).toEqual([]);
  });

  it('announces nothing when the callback was refused', async () => {
    const { handler, repository, connections, publisher } = buildSubject();
    await saveProcessing(repository);
    await connections.add({ userId: 'user-1', connectionId: 'connection-a', expiresAt: NOW });

    const response = await handler(buildCallback({ secret: 'wrong-secret' }));

    expect(response.statusCode).toBe(401);
    // A forged callback must not be able to make the platform push anything at
    // all to a named user's browser.
    expect(publisher.calls).toEqual([]);
  });

  it('announces nothing when the record named does not exist', async () => {
    const { handler, connections, publisher } = buildSubject();
    await connections.add({ userId: 'user-1', connectionId: 'connection-a', expiresAt: NOW });

    const response = await handler(buildCallback({ transcriptionId: '01ID404' }));

    expect(response.statusCode).toBe(404);
    expect(publisher.calls).toEqual([]);
  });
});
