import { TRANSCRIPTION_PAGE_SIZE } from '@vocali/contracts';
import { listTranscriptionsHandler } from './list-transcriptions.js';
import { ListUserTranscriptions } from '../../application/use-cases/list-user-transcriptions.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../test/builders/api-gateway-event.builder.js';
import { buildTranscription } from '../../../test/builders/transcription.builder.js';
import { CapturingLogger } from '../../../test/doubles/capturing-logger.js';
import { InMemoryTranscriptionRepository } from '../../../test/doubles/in-memory-transcription-repository.js';

function buildSubject(): {
  handler: ReturnType<typeof listTranscriptionsHandler>;
  repository: InMemoryTranscriptionRepository;
} {
  const repository = new InMemoryTranscriptionRepository();

  return {
    handler: listTranscriptionsHandler({
      useCase: new ListUserTranscriptions(repository),
      logger: new CapturingLogger(),
    }),
    repository,
  };
}

async function seed(
  repository: InMemoryTranscriptionRepository,
  userId: string,
  count: number,
): Promise<void> {
  for (let index = 1; index <= count; index += 1) {
    await repository.save(
      buildTranscription({ id: `01ID${String(index).padStart(3, '0')}`, userId }),
    );
  }
}

describe('listTranscriptionsHandler', () => {
  it("answers 200 with a page of the caller's own history, newest first", async () => {
    const { handler, repository } = buildSubject();
    await seed(repository, 'user-1', 3);

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response.body);
    expect((body.items as { id: string }[]).map((item) => item.id)).toEqual([
      '01ID003',
      '01ID002',
      '01ID001',
    ]);
    expect(body.nextCursor).toBeNull();
  });

  it('returns a cursor when more records follow, and pages with it', async () => {
    const { handler, repository } = buildSubject();
    await seed(repository, 'user-1', TRANSCRIPTION_PAGE_SIZE + 2);

    const first = parseResponseBody((await handler(buildApiGatewayEvent())).body);
    expect(first.items).toHaveLength(TRANSCRIPTION_PAGE_SIZE);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await handler(
      buildApiGatewayEvent({ queryStringParameters: { cursor: String(first.nextCursor) } }),
    );

    expect(second.statusCode).toBe(200);
    expect(parseResponseBody(second.body).items).toHaveLength(2);
  });

  it("never returns another user's records", async () => {
    const { handler, repository } = buildSubject();
    await seed(repository, 'user-2', 3);

    const response = await handler(
      buildApiGatewayEvent({ authorizer: { jwt: { claims: { sub: 'user-1' } } } }),
    );

    expect(parseResponseBody(response.body).items).toEqual([]);
  });

  it('answers 400 for a cursor minted for a different user', async () => {
    const { handler, repository } = buildSubject();
    await seed(repository, 'user-2', 1);
    const foreignCursor = Buffer.from(
      JSON.stringify({ userId: 'user-2', id: '01ID001' }),
      'utf8',
    ).toString('base64url');

    const response = await handler(
      buildApiGatewayEvent({ queryStringParameters: { cursor: foreignCursor } }),
    );

    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response.body).code).toBe('INVALID_CURSOR');
  });

  it('answers 401 when the request carries no identity', async () => {
    const { handler } = buildSubject();

    const response = await handler(buildApiGatewayEvent({ authorizer: null }));

    expect(response.statusCode).toBe(401);
  });
});
