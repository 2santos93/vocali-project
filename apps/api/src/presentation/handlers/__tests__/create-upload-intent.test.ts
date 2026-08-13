import { MAX_AUDIO_FILE_SIZE_BYTES } from '@vocali/contracts';
import { createUploadIntentHandler } from '../create-upload-intent.js';
import { CreateAudioUploadIntent } from '../../../application/use-cases/create-audio-upload-intent.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../../test-support/builders/api-gateway-event.builder.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { InMemoryFileStorage } from '../../../../test-support/doubles/in-memory-file-storage.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';
import { SequentialIdGenerator } from '../../../../test-support/doubles/sequential-id-generator.js';

const AUDIO_BUCKET = 'audio-bucket';

const NOW = new Date('2026-08-11T09:00:00.000Z');

const VALID_BODY = {
  fileName: 'informe radiologia.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 1_048_576,
  language: 'es',
};

function buildSubject(): {
  handler: ReturnType<typeof createUploadIntentHandler>;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const clock = new FixedClock(NOW);
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage({ bucketName: AUDIO_BUCKET, clock });
  const useCase = new CreateAudioUploadIntent(
    repository,
    storage,
    new SequentialIdGenerator(),
    clock,
  );

  return {
    handler: createUploadIntentHandler({ useCase, logger: new CapturingLogger() }),
    repository,
    storage,
  };
}

describe('createUploadIntentHandler', () => {
  it('answers 201 with the transcription id and the presigned upload', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildApiGatewayEvent({ body: JSON.stringify(VALID_BODY) }));

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response.body);
    expect(body.transcriptionId).toBe('01ID001');
    expect(body.upload).toEqual({
      url: `https://storage.test/${AUDIO_BUCKET}`,
      fields: { key: 'audio/user-1/01ID001/informe radiologia.mp3', 'Content-Type': 'audio/mpeg' },
      expiresAt: '2026-08-11T09:15:00.000Z',
    });
  });

  it('passes the platform size cap to the presigned policy', async () => {
    const { handler, storage } = buildSubject();

    await handler(buildApiGatewayEvent({ body: JSON.stringify(VALID_BODY) }));

    // The declared sizeBytes is advisory — a client can lie about it. This is
    // the value that becomes the signed content-length-range condition, and
    // so the only thing that actually enforces 20 MB.
    expect(storage.calls.presignedUploads[0]?.maxSizeBytes).toBe(MAX_AUDIO_FILE_SIZE_BYTES);
  });

  /**
   * The object key carries the owner, and `StartFileTranscription` reads the
   * owner back out of it. A handler that took the user id from the body would
   * land this upload on the named victim's storage prefix and, from there,
   * into their history.
   */
  it('builds the storage key from the sub claim, never from a user id in the body', async () => {
    const { handler, storage, repository } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: { jwt: { claims: { sub: 'real-user' } } },
      body: JSON.stringify({ ...VALID_BODY, userId: 'victim-user' }),
    });

    await handler(event);

    expect(storage.calls.presignedUploads[0]?.objectKey).toBe(
      'audio/real-user/01ID001/informe radiologia.mp3',
    );
    expect(await repository.findById('victim-user', '01ID001')).toBeNull();
    expect(await repository.findById('real-user', '01ID001')).not.toBeNull();
  });

  it('answers 401 and persists nothing when the request carries no identity', async () => {
    const { handler, repository, storage } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: null,
      body: JSON.stringify({ ...VALID_BODY, userId: 'victim-user' }),
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(storage.calls.presignedUploads).toHaveLength(0);
    expect(await repository.findById('victim-user', '01ID001')).toBeNull();
  });

  it('answers 400 for a content type the platform does not accept', async () => {
    const { handler, storage } = buildSubject();
    const body = JSON.stringify({ ...VALID_BODY, contentType: 'application/zip' });

    const response = await handler(buildApiGatewayEvent({ body }));

    expect(response.statusCode).toBe(400);
    expect(storage.calls.presignedUploads).toHaveLength(0);
  });

  it('answers 400 for a declared size beyond the platform cap', async () => {
    const { handler } = buildSubject();
    const body = JSON.stringify({ ...VALID_BODY, sizeBytes: MAX_AUDIO_FILE_SIZE_BYTES + 1 });

    const response = await handler(buildApiGatewayEvent({ body }));

    expect(response.statusCode).toBe(400);
  });

  it('answers a generic 500 when the table is unavailable', async () => {
    const { handler, repository } = buildSubject();
    repository.failOn('save', new Error('DynamoDB table vocali-transcriptions is throttling'));

    const response = await handler(buildApiGatewayEvent({ body: JSON.stringify(VALID_BODY) }));

    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response.body).code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('vocali-transcriptions');
  });
});
