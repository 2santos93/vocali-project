import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { ConnectionPublisher } from '../../domain/ports/connection-publisher.js';
import type { PublishOutcome } from '../../domain/types/publish-outcome.js';

/**
 * Not a contradiction of the rule that a Lambda cannot hold a duplex socket —
 * the rule that sends live dictation straight to the provider. Nothing here
 * holds a socket: API Gateway does, and this makes one ordinary HTTPS request
 * naming a connection it does not own. See `docs/adr/0011`.
 */
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
      // `instanceof` on an SDK class: the ban exists because esbuild renames
      // *our* classes, and this one belongs to a single copy of the client.
      //
      // Only `410 Gone` is an outcome. Reporting a throttle, a timeout or a
      // missing permission as `gone` would have the caller delete a connection
      // that is still open, and nothing re-registers it until the browser
      // reconnects.
      if (cause instanceof GoneException) return 'gone';
      throw cause;
    }

    return 'delivered';
  }
}
