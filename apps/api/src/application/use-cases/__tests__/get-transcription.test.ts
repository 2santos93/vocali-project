import { GetTranscription } from '../get-transcription.js';
import { PUBLIC_TRANSCRIPTION_FIELDS } from '../../../../test-support/public-transcription-fields.js';
import { buildTranscription } from '../../../../test-support/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';

function buildUseCase(): {
  useCase: GetTranscription;
  repository: InMemoryTranscriptionRepository;
} {
  const repository = new InMemoryTranscriptionRepository();
  return { useCase: new GetTranscription(repository), repository };
}

describe('GetTranscription', () => {
  it('returns the record for its owner', async () => {
    const { useCase, repository } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await useCase.execute({ userId: 'user-1', transcriptionId: '01A' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.id).toBe('01A');
    expect(result.value.status).toBe('PENDING_UPLOAD');
    expect(result.value.fileName).toBe('visit.mp3');
  });

  it('exposes exactly the public field set and nothing internal', async () => {
    const { useCase, repository } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await useCase.execute({ userId: 'user-1', transcriptionId: '01A' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // The shared list rather than a few spot-checked absences: this fails both
    // when an internal field leaks in and when a public one is dropped, and it
    // is the same list the history path is held to.
    expect(Object.keys(result.value).sort()).toEqual(PUBLIC_TRANSCRIPTION_FIELDS);
  });

  it('returns TRANSCRIPTION_NOT_FOUND for a missing record', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ userId: 'user-1', transcriptionId: 'missing' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
  });

  it('returns TRANSCRIPTION_NOT_FOUND, not the record, for another user', async () => {
    const { useCase, repository } = buildUseCase();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await useCase.execute({ userId: 'user-2', transcriptionId: '01A' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('TRANSCRIPTION_NOT_FOUND');
    }
  });

  it('propagates a repository failure', async () => {
    const { useCase, repository } = buildUseCase();
    repository.failNextWith = new Error('table unavailable');

    await expect(useCase.execute({ userId: 'user-1', transcriptionId: '01A' })).rejects.toThrow(
      'table unavailable',
    );
  });
});
