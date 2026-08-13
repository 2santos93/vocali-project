import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { ConnectionPublisher } from '../../domain/ports/connection-publisher.js';
import type { PublishOutcome } from '../../domain/types/connection.js';

export class ApiGatewayConnectionPublisher implements ConnectionPublisher {
  constructor(private readonly client: ApiGatewayManagementApiClient) {}

  async publish(input: { connectionId: string; payload: unknown }): Promise<PublishOutcome> {
    try {
      await this.client.send(
        new PostToConnectionCommand({
          ConnectionId: input.connectionId,
          Data: Buffer.from(JSON.stringify(input.payload), 'utf8'),
        }),
      );
    } catch (cause: unknown) {
      if (cause instanceof GoneException) return 'gone';
      throw cause;
    }

    return 'delivered';
  }
}
