import { FailTranscription } from '../fail-transcription.js';
import { buildTranscription } from '../../../../test-support/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';
import { FixedClock } from '../../../../test-support/doubles/fixed-clock.js';

const NOW = new Date('2026-08-10T10:10:00.000Z');

function buildUseCase(): {
  useCase: FailTranscription;
  repository: InMemoryTranscriptionRepository;
} {
  const repository = new InMemoryTranscriptionRepository();
  const useCase = new FailTranscription(repository, new FixedClock(NOW));
  return { useCase, repository };
}

describe('FailTranscription', () => {
  it('marks a processing transcription as failed with the given reason', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      reason: 'provider timeout',
    });

    expect(result.success).toBe(true);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('FAILED');
    expect(stored?.toPrimitives().errorMessage).toBe('provider timeout');
    expect(stored?.toPrimitives().updatedAt).toBe(NOW.toISOString());
  });

  it('fails a still-pending upload directly, covering the orphaned-job case', async () => {
    const { useCase, repository } = buildUseCase();
    // The orphan case: the record is still PENDING_UPLOAD with no
    // externalJobId when the failure callback lands.
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      reason: 'rejected payload',
    });

    expect(result.success).toBe(true);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('FAILED');
    expect(stored?.toPrimitives().errorMessage).toBe('rejected payload');
  });

  it('fails when no transcription matches the identity', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: 'missing',
      externalJobId: 'job-1',
      reason: 'provider timeout',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
  });

  it('fails when the callback job id does not match the one on record, leaving it untouched', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-other',
      reason: 'spoofed failure',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PROCESSING');
  });

  it('acknowledges a redelivered failure webhook without overwriting the recorded reason', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    transcription.markAsFailed('provider timeout', new Date('2026-08-10T10:05:00.000Z'));
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      reason: 'a different, redelivered reason',
    });

    expect(result.success).toBe(true);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.toPrimitives().errorMessage).toBe('provider timeout');
  });

  it('acknowledges a failure signal for a transcription that already completed, without changing its status', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    transcription.markAsCompleted({
      transcriptObjectKey: 'transcripts/user-1/01A.txt',
      text: 'already done',
      durationSeconds: 42,
      at: new Date('2026-08-10T10:05:00.000Z'),
      language: null,
    });
    await repository.save(transcription);

    const result = await useCase.execute({
      userId: 'user-1',
      transcriptionId: '01A',
      externalJobId: 'job-1',
      reason: 'late failure signal',
    });

    expect(result.success).toBe(true);
    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('COMPLETED');
    expect(stored?.toPrimitives().errorMessage).toBeNull();
  });

  it('propagates a repository save failure, leaving the record in its prior status', async () => {
    const { useCase, repository } = buildUseCase();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });
    transcription.markAsProcessing('job-1', new Date('2026-08-10T10:01:00.000Z'));
    await repository.save(transcription);
    repository.failOn('save', new Error('write throttled'));

    await expect(
      useCase.execute({
        userId: 'user-1',
        transcriptionId: '01A',
        externalJobId: 'job-1',
        reason: 'provider timeout',
      }),
    ).rejects.toThrow('write throttled');

    const stored = await repository.findById('user-1', '01A');
    expect(stored?.status).toBe('PROCESSING');
  });
});
