import { saveRealtimeTranscriptionHandler } from './save-realtime-transcription.js';
import { SaveRealtimeTranscription } from '../../application/use-cases/save-realtime-transcription.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../test/builders/api-gateway-event.builder.js';
import { PUBLIC_TRANSCRIPTION_FIELDS } from '../../../test/public-transcription-fields.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { FixedClock } from '../../../test/doubles/fixed-clock.js';
import { InMemoryFileStorage } from '../../../test/doubles/in-memory-file-storage.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';
import { SequentialIdGenerator } from '../../../test/doubles/sequential-id-generator.js';

const NOW = new Date('2026-08-11T09:00:00.000Z');

const VALID_BODY = {
  text: 'el paciente refiere dolor abdominal',
  durationSeconds: 37.5,
  language: 'es',
};

function buildSubject(): {
  handler: ReturnType<typeof saveRealtimeTranscriptionHandler>;
  repository: InMemoryTranscriptionRepository;
  storage: InMemoryFileStorage;
} {
  const clock = new FixedClock(NOW);
  const repository = new InMemoryTranscriptionRepository();
  const storage = new InMemoryFileStorage(clock);

  return {
    handler: saveRealtimeTranscriptionHandler({
      useCase: new SaveRealtimeTranscription(
        repository,
        storage,
        new SequentialIdGenerator(),
        clock,
      ),
      logger: new CapturingLogger(),
    }),
    repository,
    storage,
  };
}

describe('saveRealtimeTranscriptionHandler', () => {
  it('answers 201 with the stored record, exposing only its public fields', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildApiGatewayEvent({ body: JSON.stringify(VALID_BODY) }));

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response.body);
    expect(body.status).toBe('COMPLETED');
    expect(body.source).toBe('MICROPHONE');
    expect(body.durationSeconds).toBe(37.5);
    // The entity's own primitives carry userId and three object keys; a
    // handler that returned them would publish the storage layout from the
    // one endpoint whose response is built by the use case rather than mapped.
    expect(Object.keys(body).sort()).toEqual(PUBLIC_TRANSCRIPTION_FIELDS);
  });

  it('writes both transcript formats under the authenticated user', async () => {
    const { handler, storage } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: { jwt: { claims: { sub: 'real-user' } } },
      body: JSON.stringify({ ...VALID_BODY, userId: 'victim-user' }),
    });

    await handler(event);

    expect(storage.calls.writes.map((write) => write.objectKey)).toEqual([
      'transcripts/real-user/01ID001.txt',
      'transcripts/real-user/01ID001.json',
    ]);
  });

  it('applies the default language when the body names none', async () => {
    const { handler } = buildSubject();
    const body = JSON.stringify({ text: 'dolor', durationSeconds: 1 });

    const response = await handler(buildApiGatewayEvent({ body }));

    expect(parseResponseBody(response.body).language).toBe('es');
  });

  it('answers 400 for a language the provider does not support', async () => {
    const { handler, repository } = buildSubject();
    const body = JSON.stringify({ ...VALID_BODY, language: 'xx' });

    const response = await handler(buildApiGatewayEvent({ body }));

    expect(response.statusCode).toBe(400);
    expect(await repository.findById('user-1', '01ID001')).toBeNull();
  });

  it('answers 400 for an empty transcript', async () => {
    const { handler } = buildSubject();
    const body = JSON.stringify({ ...VALID_BODY, text: '' });

    expect((await handler(buildApiGatewayEvent({ body }))).statusCode).toBe(400);
  });

  it('answers 401 and writes nothing when the request carries no identity', async () => {
    const { handler, storage } = buildSubject();
    const event = buildApiGatewayEvent({
      authorizer: null,
      body: JSON.stringify({ ...VALID_BODY, userId: 'victim-user' }),
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(storage.calls.writes).toHaveLength(0);
  });

  it('answers a generic 500 when storage fails', async () => {
    const { handler, storage } = buildSubject();
    storage.failNextWith = new Error('bucket vocali-audio denied the write');

    const response = await handler(buildApiGatewayEvent({ body: JSON.stringify(VALID_BODY) }));

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('vocali-audio');
  });
});
