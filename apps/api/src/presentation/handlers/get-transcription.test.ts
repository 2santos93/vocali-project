import { getTranscriptionHandler } from './get-transcription.js';
import { GetTranscription } from '../../application/use-cases/get-transcription.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../test/builders/api-gateway-event.builder.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { PUBLIC_TRANSCRIPTION_FIELDS } from '../../../test/public-transcription-fields.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';

function buildSubject(): {
  handler: ReturnType<typeof getTranscriptionHandler>;
  repository: InMemoryTranscriptionRepository;
} {
  const repository = new InMemoryTranscriptionRepository();

  return {
    handler: getTranscriptionHandler({
      useCase: new GetTranscription(repository),
      logger: new CapturingLogger(),
    }),
    repository,
  };
}

describe('getTranscriptionHandler', () => {
  it('answers 200 with the record and only its public fields', async () => {
    const { handler, repository } = buildSubject();
    await repository.save(buildTranscription({ id: '01ID001', userId: 'user-1' }));

    const response = await handler(
      buildApiGatewayEvent({ pathParameters: { transcriptionId: '01ID001' } }),
    );

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response.body);
    expect(body.id).toBe('01ID001');
    expect(Object.keys(body).sort()).toEqual(PUBLIC_TRANSCRIPTION_FIELDS);
  });

  it('answers 404 for an id that belongs to somebody else', async () => {
    const { handler, repository } = buildSubject();
    await repository.save(buildTranscription({ id: '01ID001', userId: 'user-2' }));

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: { jwt: { claims: { sub: 'user-1' } } },
        pathParameters: { transcriptionId: '01ID001' },
      }),
    );

    expect(response.statusCode).toBe(404);
    expect(parseResponseBody(response.body).code).toBe('TRANSCRIPTION_NOT_FOUND');
    expect(response.body).not.toContain('visit.mp3');
  });

  it('answers 404 for an id that does not exist', async () => {
    const { handler } = buildSubject();

    const response = await handler(
      buildApiGatewayEvent({ pathParameters: { transcriptionId: 'missing' } }),
    );

    expect(response.statusCode).toBe(404);
  });

  it('answers 400 when the path carries no transcription id', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(400);
  });

  it('answers 401 when the request carries no identity', async () => {
    const { handler, repository } = buildSubject();
    await repository.save(buildTranscription({ id: '01ID001', userId: 'user-2' }));

    const response = await handler(
      buildApiGatewayEvent({
        authorizer: null,
        pathParameters: { transcriptionId: '01ID001', userId: 'user-2' },
      }),
    );

    expect(response.statusCode).toBe(401);
  });
});
