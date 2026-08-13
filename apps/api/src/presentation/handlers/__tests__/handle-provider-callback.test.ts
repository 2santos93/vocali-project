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

describe('handleProviderCallbackHandler: the shared secret', () => {
  it('accepts a callback presenting the configured secret', async () => {
    const { handler, repository, secrets } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({}));

    expect(response.statusCode).toBe(200);
    expect(secrets.requestedNames).toEqual([WEBHOOK_SECRET_NAME]);
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('COMPLETED');
  });

  it('answers 401 and changes nothing for a wrong secret', async () => {
    const { handler, repository, storage, provider } = buildSubject();
    await saveProcessing(repository);

    const response = await handler(buildCallback({ secret: 'not-the-shared-secret-at-all-xxxx' }));

    expect(response.statusCode).toBe(401);
    expect(parseResponseBody(response.body).code).toBe('UNAUTHENTICATED');
    expect((await repository.findById('user-1', '01ID001'))?.status).toBe('PROCESSING');
    expect(storage.calls.writes).toHaveLength(0);
    expect(provider.interpretedCallbacks).toHaveLength(0);
  });

  it('correlates the lines it writes with the request id the caller is given', async () => {
    const { handler, logger } = buildSubject();

    const response = await handler(
      buildCallback({ secret: 'not-the-shared-secret-at-all-xxxx', requestId: 'request-77' }),
    );

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

describe('handleProviderCallbackHandler: asking the provider what the callback meant', () => {
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

describe('handleProviderCallbackHandler: completion', () => {
  it('stores the text and the duration the provider reported', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveProcessing(repository);

    await handler(buildCallback({}));

    expect(storage.objects.get('transcripts/user-1/01ID001.txt')).toBe(TRANSCRIPT_TEXT);
    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.toPrimitives().durationSeconds).toBe(42);
    expect(stored?.toPrimitives().textPreview).toContain('el paciente');
  });

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

  it('completes a record whose job id was never persisted, and records it', async () => {
    const { handler, repository, provider } = buildSubject();
    await repository.save(buildPendingUpload());
    provider.nextCallbackOutcome = completed({ externalJobId: 'job-recovered' });

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

describe('handleProviderCallbackHandler: failure', () => {
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
  expect(payload.type).toBe('transcription.updated');

  return { id: payload.transcription.id, status: payload.transcription.status };
}

describe('handleProviderCallbackHandler: announcing the outcome', () => {
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
