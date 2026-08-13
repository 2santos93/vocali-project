import { ListUserTranscriptions } from '../list-user-transcriptions.js';
import { PUBLIC_TRANSCRIPTION_FIELDS } from '../../../../test-support/public-transcription-fields.js';
import { buildTranscription } from '../../../../test-support/builders/transcription.builder.js';
import { InMemoryTranscriptionRepository } from '../../../../test-support/doubles/in-memory-transcription-repository.js';

function buildUseCase(): {
  useCase: ListUserTranscriptions;
  repository: InMemoryTranscriptionRepository;
} {
  const repository = new InMemoryTranscriptionRepository();
  const useCase = new ListUserTranscriptions(repository);
  return { useCase, repository };
}

/**
 * `idOffset` exists so two users get distinguishable ids. Every other exposed
 * field is identical across builder calls and the mapper strips `userId`, so
 * without it an isolation test would be asserting a property both users share.
 */
async function seed(
  repository: InMemoryTranscriptionRepository,
  userId: string,
  count: number,
  idOffset = 0,
): Promise<void> {
  for (let i = 1; i <= count; i += 1) {
    await repository.save(
      buildTranscription({ id: String(idOffset + i).padStart(3, '0'), userId }),
    );
  }
}

describe('ListUserTranscriptions', () => {
  it('returns ten items even when more exist, with a non-null nextCursor', async () => {
    const { useCase, repository } = buildUseCase();
    await seed(repository, 'user-1', 25);

    const result = await useCase.execute({ userId: 'user-1', cursor: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Hardcoded, not re-imported from TRANSCRIPTION_PAGE_SIZE: ten per page is
    // a stated product requirement, so changing the constant must fail here
    // rather than have the assertion follow it.
    expect(result.value.items).toHaveLength(10);
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

  it("never returns another user's records", async () => {
    const { useCase, repository } = buildUseCase();
    await seed(repository, 'user-1', 2);
    await seed(repository, 'user-2', 2, 100);

    const result = await useCase.execute({ userId: 'user-1', cursor: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Asserting the exact ids, newest first: a count alone would catch two
    // pages being merged but not one user's page being served in place of
    // another's, which is the failure this test is named for.
    expect(result.value.items.map((item) => item.id)).toEqual(['002', '001']);
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
