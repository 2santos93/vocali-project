import { getTranscriptionDownloadUrlHandler } from '../get-transcription-download-url.js';
import { GetTranscriptionDownloadUrl } from '../../../application/use-cases/get-transcription-download-url.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../../test-support/builders/api-gateway-event.builder.js';
import { buildTranscription } from '../../../../test-support/builders/transcription.builder.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { InMemoryFileStorage } from '../../../../test-support/doubles/in-memory-file-storage.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';

const TRANSCRIPTS_BUCKET = 'transcripts-bucket';

const NOW = new Date('2026-08-11T09:00:00.000Z');

function buildSubject(): {
  handler: ReturnType<typeof getTranscriptionDownloadUrlHandler>;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const clock = new FixedClock(NOW);
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage({ bucketName: TRANSCRIPTS_BUCKET, clock });

  return {
    handler: getTranscriptionDownloadUrlHandler({
      useCase: new GetTranscriptionDownloadUrl(repository, storage, clock),
      logger: new CapturingLogger(),
    }),
    repository,
    storage,
  };
}

async function saveCompleted(
  repository: InMemoryTranscriptionRepository,
  userId: string,
): Promise<void> {
  const transcription = buildTranscription({ id: '01ID001', userId });
  transcription.markAsProcessing('job-1', NOW);
  transcription.markAsCompleted({
    transcriptObjectKey: `transcripts/${userId}/01ID001.txt`,
    text: 'el paciente refiere dolor',
    durationSeconds: 42,
    at: NOW,
    language: null,
  });
  await repository.save(transcription);
}

describe('getTranscriptionDownloadUrlHandler', () => {
  it('answers 200 with a signed link and its expiry', async () => {
    const { handler, repository } = buildSubject();
    await saveCompleted(repository, 'user-1');

    const response = await handler(
      buildApiGatewayEvent({ pathParameters: { transcriptionId: '01ID001' } }),
    );

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response.body)).toEqual({
      url: `https://storage.test/download/${TRANSCRIPTS_BUCKET}/transcripts/user-1/01ID001.txt`,
      format: 'txt',
      expiresAt: '2026-08-11T09:15:00.000Z',
    });
  });

  it('defaults to the text format when the query names none', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveCompleted(repository, 'user-1');

    await handler(buildApiGatewayEvent({ pathParameters: { transcriptionId: '01ID001' } }));

    expect(storage.calls.presignedDownloads[0]?.objectKey).toBe('transcripts/user-1/01ID001.txt');
  });

  it('honours an explicit json format', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveCompleted(repository, 'user-1');

    const response = await handler(
      buildApiGatewayEvent({
        pathParameters: { transcriptionId: '01ID001' },
        queryStringParameters: { format: 'json' },
      }),
    );

    expect(parseResponseBody(response.body).format).toBe('json');
    expect(storage.calls.presignedDownloads[0]?.objectKey).toBe('transcripts/user-1/01ID001.json');
  });

  it('answers 400 for a format the platform does not produce', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveCompleted(repository, 'user-1');

    const response = await handler(
      buildApiGatewayEvent({
        pathParameters: { transcriptionId: '01ID001' },
        queryStringParameters: { format: 'pdf' },
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });

  it('answers 409 for a record that has no transcript yet', async () => {
    const { handler, repository, storage } = buildSubject();
    await repository.save(buildTranscription({ id: '01ID001', userId: 'user-1' }));

    const response = await handler(
      buildApiGatewayEvent({ pathParameters: { transcriptionId: '01ID001' } }),
    );

    expect(response.statusCode).toBe(409);
    expect(parseResponseBody(response.body).code).toBe('TRANSCRIPTION_NOT_READY');
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });

  it("answers 404, and signs nothing, for another user's completed record", async () => {
    const { handler, repository, storage } = buildSubject();
    await saveCompleted(repository, 'user-2');

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: { jwt: { claims: { sub: 'user-1' } } },
        pathParameters: { transcriptionId: '01ID001' },
      }),
    );

    expect(response.statusCode).toBe(404);
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });

  it('answers 401, and signs nothing, when the request carries no identity', async () => {
    const { handler, repository, storage } = buildSubject();
    await saveCompleted(repository, 'user-2');

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: null,
        pathParameters: { transcriptionId: '01ID001', userId: 'user-2' },
      }),
    );

    expect(response.statusCode).toBe(401);
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });
});
