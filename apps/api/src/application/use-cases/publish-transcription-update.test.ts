import { TRANSCRIPTION_UPDATE_EVENT } from '@vocali/contracts/constants';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { InMemoryConnectionRegistry } from '../../../test/doubles/in-memory-connection-registry.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { RecordingConnectionPublisher } from '../../../test/doubles/recording-connection-publisher.js';
import { PublishTranscriptionUpdate } from './publish-transcription-update.js';

const NOW = new Date('2026-08-12T09:00:00.000Z');

interface Harness {
  readonly useCase: PublishTranscriptionUpdate;
  readonly repository: InMemoryTranscriptionRepository;
  readonly connections: InMemoryConnectionRegistry;
  readonly publisher: RecordingConnectionPublisher;
  readonly logger: CapturingLogger;
}

function buildHarness(): Harness {
  const repository = new InMemoryTranscriptionRepository();
  const connections = new InMemoryConnectionRegistry();
  const publisher = new RecordingConnectionPublisher();
  const logger = new CapturingLogger();

  return {
    useCase: new PublishTranscriptionUpdate(repository, connections, publisher, logger),
    repository,
    connections,
    publisher,
    logger,
  };
}

async function seedRecord(
  harness: Harness,
  options: { id?: string; userId?: string } = {},
): Promise<void> {
  const transcription = buildTranscription({
    id: options.id ?? '01RECORD',
    userId: options.userId ?? 'user-1',
  });
  const saved = await harness.repository.save(transcription);
  if (!saved.success) throw new Error('fixture must save');
}

async function openConnection(
  harness: Harness,
  userId: string,
  connectionId: string,
): Promise<void> {
  await harness.connections.add({ userId, connectionId, expiresAt: NOW });
}

describe('PublishTranscriptionUpdate', () => {
  it('pushes the public transcription to the one connection the user holds', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-1', 'connection-a');

    await harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' });

    expect(harness.publisher.calls).toHaveLength(1);
    expect(harness.publisher.calls[0]?.connectionId).toBe('connection-a');

    const payload = harness.publisher.calls[0]?.payload as {
      type: string;
      transcription: { id: string; status: string };
    };
    expect(payload.type).toBe(TRANSCRIPTION_UPDATE_EVENT);
    expect(payload.transcription.id).toBe('01RECORD');
    expect(payload.transcription.status).toBe('PENDING_UPLOAD');
  });

  it('never puts an internal identifier on the wire', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-1', 'connection-a');

    await harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' });

    // The payload leaves the platform, so it goes through the public DTO. A
    // spread of the primitives would carry the owning user and three storage
    // keys down a socket to a browser.
    const payload = harness.publisher.calls[0]?.payload as { transcription: object };
    expect(payload.transcription).not.toHaveProperty('userId');
    expect(payload.transcription).not.toHaveProperty('audioObjectKey');
    expect(payload.transcription).not.toHaveProperty('transcriptObjectKey');
    expect(payload.transcription).not.toHaveProperty('externalJobId');
  });

  it('reaches every tab the user has open', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-1', 'connection-a');
    await openConnection(harness, 'user-1', 'connection-b');

    await harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' });

    expect(harness.publisher.calls.map((call) => call.connectionId)).toEqual([
      'connection-a',
      'connection-b',
    ]);
  });

  it('publishes nothing to another user connections', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-2', 'connection-b');

    await harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' });

    expect(harness.publisher.calls).toHaveLength(0);
  });

  /*
   * The 410 cleanup.
   *
   * A browser that closed its laptop lid leaves a connection id API Gateway
   * answers `410 Gone` for, and no `$disconnect` was ever delivered for it.
   * Without this branch the entry survives until its expiry and every
   * completion in between pays a failed publish for it.
   *
   * Asserting only that the publish did not throw would pin nothing: a use
   * case that ignored the outcome entirely would pass that. The assertion is
   * that the entry is gone from the registry afterwards.
   */
  it('deletes a connection that answers gone, and keeps the live one', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-1', 'departed');
    await openConnection(harness, 'user-1', 'live');
    harness.publisher.goneConnectionIds.add('departed');

    await harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' });

    expect(await harness.connections.listByUser('user-1')).toEqual([{ connectionId: 'live' }]);
    expect(harness.connections.calls.removed).toEqual([
      { userId: 'user-1', connectionId: 'departed' },
    ]);
  });

  it('does not delete a connection that took the message', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-1', 'live');

    await harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' });

    // The mirror of the case above, and the reason it is worth its own test: a
    // cleanup that ran on every outcome would leave the user with no
    // connection after their first completion, and the next one would be
    // silently undeliverable.
    expect(harness.connections.calls.removed).toEqual([]);
  });

  it('succeeds, and publishes nothing, when the user has no connection open', async () => {
    const harness = buildHarness();
    await seedRecord(harness);

    await expect(
      harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' }),
    ).resolves.toBeUndefined();
    expect(harness.publisher.calls).toHaveLength(0);
  });

  it('survives a publish that fails outright, and still reaches the other tab', async () => {
    const harness = buildHarness();
    await seedRecord(harness);
    await openConnection(harness, 'user-1', 'throttled');
    await openConnection(harness, 'user-1', 'live');
    harness.publisher.failNextWith = new Error('rate exceeded');

    await expect(
      harness.useCase.execute({ userId: 'user-1', transcriptionId: '01RECORD' }),
    ).resolves.toBeUndefined();

    // The second tab was still told. `Promise.all` would have abandoned it at
    // the first rejection, so this is what pins `allSettled`.
    expect(harness.publisher.calls.map((call) => call.connectionId)).toEqual(['live']);
    expect(harness.logger.entries.filter((entry) => entry.level === 'warn')).toHaveLength(1);
  });

  it('does nothing when the record cannot be read back', async () => {
    const harness = buildHarness();
    await openConnection(harness, 'user-1', 'connection-a');

    await expect(
      harness.useCase.execute({ userId: 'user-1', transcriptionId: 'never-written' }),
    ).resolves.toBeUndefined();
    expect(harness.publisher.calls).toHaveLength(0);
  });
});
