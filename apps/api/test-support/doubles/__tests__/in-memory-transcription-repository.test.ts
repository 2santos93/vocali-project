import { InMemoryTranscriptionRepository } from '../in-memory-transcription-repository.js';
import { buildTranscription } from '../../builders/transcription.builder.js';
import { InvalidCursorError } from '../../../src/domain/errors/domain-error.js';
import type { TranscriptionPage } from '../../../src/domain/types/transcription.js';
import type { Result } from '../../../src/domain/types/result.js';

function expectOk(result: Result<TranscriptionPage, InvalidCursorError>): TranscriptionPage {
  if (!result.success) throw new Error(`expected an ok result, got: ${result.error.message}`);
  return result.value;
}

describe('InMemoryTranscriptionRepository', () => {
  it('returns transcriptions newest first', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));
    await repository.save(buildTranscription({ id: '01B', userId: 'user-1' }));

    const page = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null }),
    );

    expect(page.items.map((item) => item.id)).toEqual(['01B', '01A']);
    expect(page.nextCursor).toBeNull();
  });

  it("paginates with a cursor and never leaks another user's data", async () => {
    const repository = new InMemoryTranscriptionRepository();
    for (const id of ['01A', '01B', '01C']) {
      await repository.save(buildTranscription({ id, userId: 'user-1' }));
    }
    await repository.save(buildTranscription({ id: '01Z', userId: 'user-2' }));

    const first = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
    );
    expect(first.items.map((item) => item.id)).toEqual(['01C', '01B']);
    expect(first.nextCursor).not.toBeNull();

    const second = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 2, cursor: first.nextCursor }),
    );
    expect(second.items.map((item) => item.id)).toEqual(['01A']);
    expect(second.nextCursor).toBeNull();
  });

  it("does not find another user's transcription by id", async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    expect(await repository.findById('user-2', '01A')).toBeNull();
  });

  it('keeps cursor position stable when a record is inserted between pages', async () => {
    const repository = new InMemoryTranscriptionRepository();
    for (const id of ['01A', '01B', '01C']) {
      await repository.save(buildTranscription({ id, userId: 'user-1' }));
    }

    const first = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
    );
    expect(first.items.map((item) => item.id)).toEqual(['01C', '01B']);

    // A newer transcription arrives while the caller is still paging.
    await repository.save(buildTranscription({ id: '01D', userId: 'user-1' }));

    const second = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 2, cursor: first.nextCursor }),
    );

    expect(second.items.map((item) => item.id)).toEqual(['01A']);
    expect(second.nextCursor).toBeNull();
  });

  it('returns an INVALID_CURSOR error for a malformed cursor instead of an empty page', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    const result = await repository.listByUser({
      userId: 'user-1',
      limit: 10,
      cursor: 'not-a-real-cursor',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(InvalidCursorError);
      expect(result.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('returns an INVALID_CURSOR error for a cursor minted for a different user', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));
    await repository.save(buildTranscription({ id: '01B', userId: 'user-1' }));
    await repository.save(buildTranscription({ id: '01Z', userId: 'user-2' }));

    const page = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 1, cursor: null }),
    );
    expect(page.nextCursor).not.toBeNull();

    const result = await repository.listByUser({
      userId: 'user-2',
      limit: 10,
      cursor: page.nextCursor,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_CURSOR');
    }
  });

  it('does not let identifiers containing "#" collide across users', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: 'b#c', userId: 'a' }));
    await repository.save(buildTranscription({ id: 'c', userId: 'a#b' }));

    const first = await repository.findById('a', 'b#c');
    const second = await repository.findById('a#b', 'c');

    // A flat `${userId}#${id}` key maps both saves to "a#b#c", so the second
    // silently overwrites the first and both lookups below still return a
    // non-null — but wrong — record. Asserting identity is what catches that.
    expect(first?.toPrimitives()).toMatchObject({ id: 'b#c', userId: 'a' });
    expect(second?.toPrimitives()).toMatchObject({ id: 'c', userId: 'a#b' });
    expect(await repository.findById('a#b', 'b#c')).toBeNull();
  });

  it('returns nextCursor null when the page holds exactly limit items and nothing more', async () => {
    const repository = new InMemoryTranscriptionRepository();
    for (const id of ['01A', '01B']) {
      await repository.save(buildTranscription({ id, userId: 'user-1' }));
    }

    const page = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 2, cursor: null }),
    );

    expect(page.items.map((item) => item.id)).toEqual(['01B', '01A']);
    expect(page.nextCursor).toBeNull();
  });

  it('rejects a save derived from a read older than the stored revision', async () => {
    const repository = new InMemoryTranscriptionRepository();
    const transcription = buildTranscription({ id: '01A', userId: 'user-1' });

    // The same entity saved twice: the first write advances the revision, so
    // the second is derived from a read that is now stale — the shape of the
    // defect where a completion webhook writes COMPLETED and another in-flight
    // path puts the record back to PROCESSING.
    await expect(repository.save(transcription)).resolves.toEqual({
      success: true,
      value: undefined,
    });

    const second = await repository.save(transcription);

    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error.code).toBe('CONCURRENT_MODIFICATION');
    }
  });

  it('accepts a save carrying the revision the record was last written at', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    // Re-read, so the entity carries the current revision rather than the one
    // it was constructed with. Without this the rejection above could be
    // satisfied by a double that refuses every second write.
    const reread = await repository.findById('user-1', '01A');
    expect(reread).not.toBeNull();

    const result = await repository.save(reread!);

    expect(result.success).toBe(true);
  });

  it('refuses a second save claiming a session id already taken', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
      clientSessionId: 'session-abc',
    });

    const result = await repository.save(buildTranscription({ id: '01B', userId: 'user-1' }), {
      clientSessionId: 'session-abc',
    });

    expect(result.success).toBe(false);
    // Refused as a whole, like the transaction the adapter sends: a double
    // that stored the record and only skipped the claim would let a use-case
    // test pass while production left nothing behind at all.
    expect(await repository.findById('user-1', '01B')).toBeNull();
    expect((await repository.findByClientSession('user-1', 'session-abc'))?.toPrimitives().id).toBe(
      '01A',
    );
  });

  it('keeps one user session id out of another user partition', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }), {
      clientSessionId: 'session-abc',
    });

    const theirs = await repository.save(buildTranscription({ id: '01B', userId: 'user-2' }), {
      clientSessionId: 'session-abc',
    });

    expect(theirs.success).toBe(true);
    expect(await repository.findByClientSession('user-2', 'session-abc')).not.toBeNull();
  });

  it('returns null for a session id nothing has claimed', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));

    expect(await repository.findByClientSession('user-1', 'session-abc')).toBeNull();
  });

  it('rejects with the injected failure and clears it after one use', async () => {
    const repository = new InMemoryTranscriptionRepository();
    const failure = new Error('table is throttled');
    repository.failNextWith = failure;

    await expect(
      repository.listByUser({ userId: 'user-1', limit: 10, cursor: null }),
    ).rejects.toThrow(failure);

    const page = expectOk(
      await repository.listByUser({ userId: 'user-1', limit: 10, cursor: null }),
    );
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('rejects only the targeted method, leaving an earlier call in the same flow unaffected', async () => {
    const repository = new InMemoryTranscriptionRepository();
    await repository.save(buildTranscription({ id: '01A', userId: 'user-1' }));
    repository.failOn('save', new Error('write throttled'));

    // findById is not the targeted method, so it must still succeed even
    // though a failure is scheduled for save.
    const found = await repository.findById('user-1', '01A');
    expect(found?.toPrimitives()).toMatchObject({ id: '01A', userId: 'user-1' });

    await expect(
      repository.save(buildTranscription({ id: '01A', userId: 'user-1' })),
    ).rejects.toThrow('write throttled');

    // The scheduled failure was consumed by the one save call above.
    await expect(
      repository.save(buildTranscription({ id: '01B', userId: 'user-1' })),
    ).resolves.toEqual({ success: true, value: undefined });
  });
});
