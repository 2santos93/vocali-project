import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { mockClient } from 'aws-sdk-client-mock';
import { ApiGatewayConnectionPublisher } from '../api-gateway-connection-publisher.js';

const management = mockClient(ApiGatewayManagementApiClient);

function buildPublisher(): ApiGatewayConnectionPublisher {
  return new ApiGatewayConnectionPublisher(
    new ApiGatewayManagementApiClient({ region: 'eu-west-1', endpoint: 'https://sockets.test' }),
  );
}

beforeEach(() => {
  management.reset();
});

describe('ApiGatewayConnectionPublisher', () => {
  it('posts the payload as JSON to the named connection', async () => {
    management.on(PostToConnectionCommand).resolves({});

    const outcome = await buildPublisher().publish({
      connectionId: 'connection-a',
      payload: { type: 'transcription.updated', transcription: { id: '01RECORD' } },
    });

    expect(outcome).toBe('delivered');
    const input = management.commandCalls(PostToConnectionCommand)[0]?.args[0].input;
    expect(input?.ConnectionId).toBe('connection-a');
    expect(Buffer.from(input?.Data as Uint8Array).toString('utf8')).toBe(
      '{"type":"transcription.updated","transcription":{"id":"01RECORD"}}',
    );
  });

  it('reports a departed connection as gone rather than raising', async () => {
    management
      .on(PostToConnectionCommand)
      .rejects(new GoneException({ $metadata: {}, message: 'Gone' }));

    expect(await buildPublisher().publish({ connectionId: 'departed', payload: {} })).toBe('gone');
  });

  it('lets a failure that is not a departed connection propagate', async () => {
    management.on(PostToConnectionCommand).rejects(new Error('rate exceeded'));

    await expect(
      buildPublisher().publish({ connectionId: 'connection-a', payload: {} }),
    ).rejects.toThrow('rate exceeded');
  });
});
