import type { TranscriptionStatus } from '@vocali/contracts';
import { CompleteTranscription } from '../complete-transcription.js';
import { buildTranscription } from '../../../../test-support/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';
import { InMemoryFileStorage } from '../../../../test-support/doubles/in-memory-file-storage.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';
import { Transcription } from '../../../domain/entities/transcription.js';

const TRANSCRIPTS_BUCKET = 'transcripts-bucket';

const NOW = new Date('2026-08-10T10:10:00.000Z');

function buildUseCase(): {
  useCase: CompleteTranscription;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage({ bucketName: TRANSCRIPTS_BUCKET });
  const useCase = new CompleteTranscription(repository, storage, new FixedClock(NOW));
  return { useCase, repository, storage };
}

describe('CompleteTranscription', () => {
  it('stores the transcript and marks the record completed', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'the patient reports mild pain',
      durationSeconds: 42,
      language: null,
    });

    expect(result.success).toBe(true);
    expect(storage.objects.get('transcripts/user-1/01A.txt')).toBe('the patient reports mild pain');
    const jsonBody = storage.objects.get('transcripts/user-1/01A.json');
    expect(jsonBody).toBeDefined();
    expect(JSON.parse(jsonBody ?? '')).toEqual({
      text: 'the patient reports mild pain',
      durationSeconds: 42,
    });

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().durationSeconds).toBe(42);
    expect(stored?.toPrimitives().updatedAt).toBe(NOW.toISOString());
  });

  it('records the language the provider identified', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    // English, on a record created with no language at all: asserting Spanish
    // could not tell a threaded value from the old default.
    await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'the patient reports mild pain',
      durationSeconds: 42,
      language: 'en',
    });

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.toPrimitives().language).toBe('en');
  });

  /*
   * A job too short to identify still produces a transcript, and that is the
   * point. Nothing is written over: the record keeps whatever it held.
   */
  it('leaves the language alone when the provider identified none', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'mmm',
      durationSeconds: 1,
      language: null,
    });

    expect(result.success).toBe(true);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().language).toBeNull();
  });

  it('fails when no transcription matches the identity, without contacting storage', async () => {
    const { useCase, storage } = buildUseCase();

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: 'missing',
      externalJobId: 'job-1',
      text: 'text',
      durationSeconds: 1,
      language: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('fails when the callback job id does not match the one on record, leaving it untouched', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-other',
      text: 'spoofed text',
      durationSeconds: 99,
      language: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    expect(storage.calls.writes).toHaveLength(0);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PROCESSING');
    expect(stored?.externalJobId).toBe('job-1');
  });

  it('acknowledges a redelivered webhook for a job already completed, without mutating the stored transcript', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    transcription.markAsCompleted({
      transcriptObjectKey: 'transcripts/user-1/01A.txt',
      text: 'original text',
      durationSeconds: 42,
      at: new Date('2026-08-10T10:05:00.000Z'),
      language: null,
    });
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'a different, redelivered payload',
      durationSeconds: 999,
      language: null,
    });

    expect(result.success).toBe(true);
    expect(storage.calls.writes).toHaveLength(0);

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.toPrimitives().textPreview).toBe('original text');
    expect(stored?.toPrimitives().durationSeconds).toBe(42);
  });

  it('repairs an orphaned PENDING_UPLOAD record by recording the callback job id before completing', async () => {
    const { useCase, repository, storage } = buildUseCase();
    // The orphan case: the provider accepted the job but the save that would
    // have recorded PROCESSING and the job id never happened.
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'recovered transcript',
      durationSeconds: 10,
      language: null,
    });

    expect(result.success).toBe(true);
    expect(storage.objects.get('transcripts/user-1/01A.txt')).toBe('recovered transcript');

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.externalJobId).toBe('job-1');
  });

  it('completes a late transcript for a transcription already marked failed, clearing the error message', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    transcription.markAsFailed('provider timeout', new Date('2026-08-10T10:05:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'the late transcript arrived after all',
      durationSeconds: 30,
      language: null,
    });

    expect(result.success).toBe(true);
    expect(storage.objects.get('transcripts/user-1/01A.txt')).toBe(
      'the late transcript arrived after all',
    );

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().errorMessage).toBeNull();
  });

  it('rejects completion for a corrupted stored status, without writing to storage', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const corrupted = Transcription.fromPrimitives({
      ...buildTranscription({ id: '01A', userId: 'user-1' }).toPrimitives(),
      status: 'ARCHIVED' as unknown as TranscriptionStatus,
      externalJobId: 'job-1',
    });
    await repository.save(corrupted);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      text: 'text',
      durationSeconds: 5,
      language: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_STATUS_TRANSITION');
    }
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('propagates a storage failure, leaving the record in its prior status', async () => {
    const { useCase, repository, storage } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);
    storage.failNextWith = new Error('storage unavailable');

    await expect(
      useCase.execute({
        userId: 'user-1',
        transcriptionId: '01A',
        externalJobId: 'job-1',
        text: 'text',
        durationSeconds: 5,
        language: null,
      }),
    ).rejects.toThrow('storage unavailable');

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PROCESSING');
  });
});
