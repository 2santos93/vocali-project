import { TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import { ListUserTranscriptions } from './list-user-transcriptions.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';

const PUBLIC_TRANSCRIPTION_FIELDS = [
  'id',
  'fileName',
  'source',
  'status',
  'language',
  'durationSeconds',
  'sizeBytes',
  'textPreview',
  'errorMessage',
  'createdAt',
  'updatedAt',
].sort();

function buildUseCase(): {
  useCase: ListUserTranscriptions;
  repository: InMemoryTranscriptionRepository;
} {
  const repository = new InMemoryTranscriptionRepository();
  const useCase = new ListUserTranscriptions(repository);
  return { useCase, repository };
}

async function seed(
  repository: InMemoryTranscriptionRepository,
  userId: string,
  count: number,
): Promise<void> {
  for (let i = 1; i <= count; i += 1) {
    await repository.save(buildTranscription({ id: String(i).padStart(3, '0'), userId }));
  }
}

describe('ListUserTranscriptions', () => {
  it('returns at most TRANSCRIPTION_PAGE_SIZE items even when more exist, with a non-null nextCursor', async () => {
    const { useCase, repository } = buildUseCase();
    await seed(repository, 'user-1', 25);

    const result = await useCase.execute({ userId: 'user-1', cursor: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.items).toHaveLength(TRANSCRIPTION_PAGE_SIZE);
    expect(result.value.nextCursor).not.toBeNull();
  });

  it('returns a null nextCursor on the last page', async () => {
    const { useCase, repository } = buildUseCase();
    await seed(repository, 'user-1', 3);

    const result = await useCase.execute({ userId: 'user-1', cursor: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.items).toHaveLength(3);
    expect(result.value.nextCursor).toBeNull();
  });

  it('never returns another user records', async () => {
    const { useCase, repository } = buildUseCase();
    await seed(repository, 'user-1', 2);
    await seed(repository, 'user-2', 2);

    const result = await useCase.execute({ userId: 'user-1', cursor: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items.every((item) => item.id.startsWith('00'))).toBe(true);
  });

  it('maps only the public fields, omitting userId and every internal object key', async () => {
    const { useCase, repository } = buildUseCase();
    await repository.save(buildTranscription({ id: '001', userId: 'user-1' }));

    const result = await useCase.execute({ userId: 'user-1', cursor: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const [item] = result.value.items;
    expect(item).toBeDefined();
    expect(Object.keys(item ?? {}).sort()).toEqual(PUBLIC_TRANSCRIPTION_FIELDS);
    expect(item).not.toHaveProperty('userId');
    expect(item).not.toHaveProperty('audioObjectKey');
    expect(item).not.toHaveProperty('transcriptObjectKey');
    expect(item).not.toHaveProperty('externalJobId');
  });

  it('returns an INVALID_CURSOR error for a malformed cursor', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({ userId: 'user-1', cursor: 'not-a-real-cursor' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('propagates a repository failure', async () => {
    const { useCase, repository } = buildUseCase();
    repository.failNextWith = new Error('table is throttled');

    await expect(useCase.execute({ userId: 'user-1', cursor: null })).rejects.toThrow(
      'table is throttled',
    );
  });
});
