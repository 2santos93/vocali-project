import { GetTranscriptionDownloadUrl } from './get-transcription-download-url.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';

const TRANSCRIPTS_BUCKET = 'transcripts-bucket';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function buildUseCase(): {
  useCase: GetTranscriptionDownloadUrl;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage({ bucketName: TRANSCRIPTS_BUCKET });
  const useCase = new GetTranscriptionDownloadUrl(repository, storage, new FixedClock(NOW));
  return { useCase, repository, storage };
}

async function buildCompletedTranscription(
  repository: InMemoryTranscriptionRepository,
): Promise<void> {
  const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
  transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
  transcription.markAsCompleted({
    transcriptObjectKey: 'transcripts/user-1/01A.txt',
    text: 'the patient reports mild pain',
    durationSeconds: 42,
    at: new Date('2026-08-10T10:05:00.000Z'),
    language: null,
  });
  await repository.save(transcription);
}

describe('GetTranscriptionDownloadUrl', () => {
  it('returns a download url for a completed record', async () => {
    const { useCase, repository, storage } = buildUseCase();
    await buildCompletedTranscription(repository);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      format: 'txt',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.url).toBe(
      `https://storage.test/download/${TRANSCRIPTS_BUCKET}/transcripts/user-1/01A.txt`,
    );
    expect(result.value.format).toBe('txt');
    // Both values are hardcoded rather than derived from the source constant:
    // shortening or lengthening the link's lifetime must break this test, not
    // be silently tracked by it. The two must also agree — a link the client
    // believes lasts fifteen minutes while the signature expires sooner is a
    // download that fails after the user has already clicked it.
    // They stay literals now that DOWNLOAD_URL_TTL_SECONDS lives in
    // application/constants.ts and is one import away: importing it would make
    // both of these `expect(constant).toBe(constant)`, which pins nothing.
    expect(result.value.expiresAt).toBe('2026-08-10T12:15:00.000Z');

    expect(storage.calls.presignedDownloads).toHaveLength(1);
    expect(storage.calls.presignedDownloads[0]?.objectKey).toBe('transcripts/user-1/01A.txt');
    expect(storage.calls.presignedDownloads[0]?.downloadFileName).toBe('01A.txt');
    expect(storage.calls.presignedDownloads[0]?.expiresInSeconds).toBe(900);
  });

  it('builds the json variant key when the json format is requested', async () => {
    const { useCase, repository, storage } = buildUseCase();
    await buildCompletedTranscription(repository);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      format: 'json',
    });

    expect(result.success).toBe(true);
    expect(storage.calls.presignedDownloads[0]?.objectKey).toBe('transcripts/user-1/01A.json');
  });

  it('returns TRANSCRIPTION_NOT_FOUND for a missing record, without contacting storage', async () => {
    const { useCase, storage } = buildUseCase();

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: 'missing',
      format: 'txt',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });

  it('returns TRANSCRIPTION_NOT_FOUND, not a distinct forbidden error, for another user id', async () => {
    const { useCase, repository, storage } = buildUseCase();
    await buildCompletedTranscription(repository);

    const result = await useCase.execute({
      userId: 'user-2',
      transcriptionId: '01A',
      format: 'txt',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });

  it('returns TRANSCRIPTION_NOT_READY for a record still processing', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      format: 'txt',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_READY');
    }
    expect(storage.calls.presignedDownloads).toHaveLength(0);
  });

  it('propagates a storage failure', async () => {
    const { useCase, repository, storage } = buildUseCase();
    await buildCompletedTranscription(repository);
    storage.failNextWith = new Error('storage unavailable');

    await expect(
      useCase.execute({ userId: 'user-1', transcriptionId: '01A', format: 'txt' }),
    ).rejects.toThrow('storage unavailable');
  });
});
