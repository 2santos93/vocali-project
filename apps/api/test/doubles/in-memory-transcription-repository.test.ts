import { InMemoryTranscriptionRepository } from './in-memory-transcription-repository.js';
import { buildTranscription } from '../builders/transcription.builder.js';

describe('InMemoryTranscriptionRepository', () => {
  it('returns transcriptions newest first', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));
    await repository.save(buildTranscription({ id: '01B', userId: 'user-1' }));

    const page = await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null });

    expect(page.items.map((item) => item.id)).toEqual(['01B', '01A']);
    expect(page.nextCursor).toBeNull();
  });

  it('paginates with a cursor and never leaks another user data', async () => {
    const repository = new InMemoryTranscriptionRepository();
    for (const id of ['01A', '01B', '01C']) {
      await repository.save(buildTranscription({ id, userId: 'user-1' }));
    }
    await repository.save(buildTranscription({ id: '01Z', userId: 'user-2' }));

    const first = await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null });
    expect(first.items.map((item) => item.id)).toEqual(['01C', '01B']);
    expect(first.nextCursor).not.toBeNull();

    const second = await repository.listByUser({
      userId: 'user-1',
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((item) => item.id)).toEqual(['01A']);
    expect(second.nextCursor).toBeNull();
  });

  it('does not find another user transcription by id', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    expect(await repository.findById('user-2', '01A')).toBeNull();
  });
});
