import {
  decodeS3ObjectKey,
  startTranscriptionJobHandler,
  type S3ObjectCreatedEvent,
} from './start-transcription-job.js';
import { StartFileTranscription } from '../../application/use-cases/start-file-transcription.js';
import { Transcription } from '../../domain/entities/transcription.js';
import { AudioFile } from '../../domain/value-objects/audio-file.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { FakeTranscriptionProvider } from '../../../test/doubles/fake-transcription-provider.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';

const NOW = new Date('2026-08-11T09:00:00.000Z');
const CALLBACK_BASE_URL = 'https://api.test/webhooks/transcription-provider';

/**
 * The name a Spanish clinical upload actually has: a space and an accent.
 * S3 delivers it in the encoded form on the right.
 */
const FILE_NAME = 'informe radiología.mp3';
const ENCODED_FILE_NAME = 'informe+radiolog%C3%ADa.mp3';

function buildSubject(): {
  handler: ReturnType<typeof startTranscriptionJobHandler>;
  repository: InMemoryTranscriptionRepository;
  provider: FakeTranscriptionProvider;
  logger: CapturingLogger;
} {
  const clock = new FixedClock(NOW);
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage(clock);
  const provider = new FakeTranscriptionProvider(clock);
  const logger = new CapturingLogger();

  const useCase = new StartFileTranscription(repository, storage, provider, clock, logger, {
    callbackBaseUrl: CALLBACK_BASE_URL,
  });

  return {
    handler: startTranscriptionJobHandler({ useCase, logger }),
    repository,
    provider,
    logger,
  };
}

function buildEvent(...keys: string[]): S3ObjectCreatedEvent {
  return { Records: keys.map((key) => ({ s3: { object: { key } } })) };
}

async function savePendingUpload(
  repository: InMemoryTranscriptionRepository,
  fileName: string,
): Promise<string> {
  const audioFile = AudioFile.create({
    fileName,
    contentType: 'audio/mpeg',
    sizeBytes: 2_048,
  });
  if (!audioFile.success) throw new Error('fixture must be valid');

  const audioObjectKey = `audio/user-1/01ID001/${fileName}`;
  await repository.save(
    Transcription.createForFileUpload({
      id: '01ID001',
      userId: 'user-1',
      audioFile: audioFile.value,
      audioObjectKey,
      language: 'es',
      createdAt: NOW,
    }),
  );

  return audioObjectKey;
}

describe('decodeS3ObjectKey', () => {
  it('decodes a plus as a space and percent escapes as their characters', () => {
    expect(decodeS3ObjectKey(`audio/user-1/01ID001/${ENCODED_FILE_NAME}`)).toBe(
      `audio/user-1/01ID001/${FILE_NAME}`,
    );
  });

  it('preserves a literal plus that arrived percent-escaped', () => {
    // `%2B` is a plus in the file name itself. Decoding before replacing would
    // turn it into a `+` that the replacement then destroyed, so the order of
    // the two operations is load-bearing rather than incidental.
    expect(decodeS3ObjectKey('audio/user-1/01ID001/dosis%2B.mp3')).toBe(
      'audio/user-1/01ID001/dosis+.mp3',
    );
  });

  it('returns null rather than throwing on a key that cannot be decoded', () => {
    expect(decodeS3ObjectKey('audio/user-1/01ID001/100%broken.mp3')).toBeNull();
  });
});

describe('startTranscriptionJobHandler', () => {
  /**
   * The test the whole decoding step exists for. Without it the lookup misses,
   * `StartFileTranscription` reports the record as not found, and the upload
   * sits at PENDING_UPLOAD for ever with no error anywhere — and on a Spanish
   * medical product, a name with an accent or a space is the ordinary case.
   */
  it('submits a job for a file whose name carries a space and an accent', async () => {
    const { handler, repository, provider } = buildSubject();
    const audioObjectKey = await savePendingUpload(repository, FILE_NAME);

    await handler(buildEvent(`audio/user-1/01ID001/${ENCODED_FILE_NAME}`));

    expect(provider.submissions).toHaveLength(1);
    expect(provider.submissions[0]?.audioUrl).toBe(`https://storage.test/read/${audioObjectKey}`);
    expect(provider.submissions[0]?.callbackUrl).toBe(
      `${CALLBACK_BASE_URL}?transcriptionId=01ID001&userId=user-1`,
    );

    const stored = await repository.findById('user-1', '01ID001');
    expect(stored?.toPrimitives().status).toBe('PROCESSING');
  });

  it('submits a job for a plain ascii name too', async () => {
    const { handler, repository, provider } = buildSubject();
    await savePendingUpload(repository, 'visit.mp3');

    await handler(buildEvent('audio/user-1/01ID001/visit.mp3'));

    expect(provider.submissions).toHaveLength(1);
  });

  it('processes every record in one notification', async () => {
    const { handler, repository, provider } = buildSubject();
    await savePendingUpload(repository, FILE_NAME);
    const second = AudioFile.create({
      fileName: 'consulta.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 1_024,
    });
    if (!second.success) throw new Error('fixture must be valid');
    await repository.save(
      Transcription.createForFileUpload({
        id: '01ID002',
        userId: 'user-1',
        audioFile: second.value,
        audioObjectKey: 'audio/user-1/01ID002/consulta.mp3',
        language: 'es',
        createdAt: NOW,
      }),
    );

    await handler(
      buildEvent(`audio/user-1/01ID001/${ENCODED_FILE_NAME}`, 'audio/user-1/01ID002/consulta.mp3'),
    );

    expect(provider.submissions).toHaveLength(2);
  });

  /**
   * S3 delivers at least once. A redelivery must not spend provider quota a
   * second time, and must not raise — a throw here would send the
   * notification round the retry loop again and eventually to a dead-letter
   * queue, for an event that was handled correctly the first time.
   */
  it('acknowledges a redelivered event without submitting a second job', async () => {
    const { handler, repository, provider } = buildSubject();
    await savePendingUpload(repository, FILE_NAME);
    const event = buildEvent(`audio/user-1/01ID001/${ENCODED_FILE_NAME}`);

    await handler(event);
    await expect(handler(event)).resolves.toBeUndefined();

    expect(provider.submissions).toHaveLength(1);
    expect(provider.submissions[0]?.callbackUrl).toContain('transcriptionId=01ID001');
  });

  it('acknowledges and logs an event with no matching record', async () => {
    const { handler, provider, logger } = buildSubject();

    await expect(handler(buildEvent('audio/user-1/01ID404/ghost.mp3'))).resolves.toBeUndefined();

    expect(provider.submissions).toHaveLength(0);
    expect(logger.serialise()).toContain('no matching transcription');
  });

  it('acknowledges and logs a key that cannot be decoded, without failing the batch', async () => {
    const { handler, repository, provider, logger } = buildSubject();
    await savePendingUpload(repository, 'visit.mp3');

    await expect(
      handler(buildEvent('audio/user-1/01ID001/100%broken.mp3', 'audio/user-1/01ID001/visit.mp3')),
    ).resolves.toBeUndefined();

    expect(logger.serialise()).toContain('could not be decoded');
    // The valid record in the same notification still went through.
    expect(provider.submissions).toHaveLength(1);
  });

  /**
   * Infrastructure failures are the one thing that must propagate, so Lambda
   * retries the notification. That is safe precisely because the redelivery
   * test above holds.
   */
  it('lets an infrastructure failure propagate so the notification is retried', async () => {
    const { handler, repository } = buildSubject();
    await savePendingUpload(repository, FILE_NAME);
    repository.failOn('findById', new Error('table unavailable'));

    await expect(handler(buildEvent(`audio/user-1/01ID001/${ENCODED_FILE_NAME}`))).rejects.toThrow(
      'table unavailable',
    );
  });
});
