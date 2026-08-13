import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi';
import { GoneException, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type {
  ConnectionPublisher,
  PublishOutcome,
} from '../../domain/ports/connection-publisher.js';

/**
 * Sends a message down a websocket API Gateway is holding.
 *
 * This adapter is where the platform's two apparently contradictory positions
 * on websockets meet, and it is worth stating plainly because on a quick read
 * it looks like one rule breaking another. The ruling that a Lambda cannot
 * hold a duplex socket stands, and is why live dictation connects the browser
 * straight to the provider. Nothing here holds a socket either: API Gateway
 * holds it, and this function makes one ordinary HTTPS request to the
 * management API naming a connection it does not own and will not keep. See
 * `docs/adr/0011`.
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
      // `instanceof` on an SDK class, as in the DynamoDB adapter and for the
      // same reason: the ban exists because esbuild renames *our* classes, and
      // this one belongs to a single copy of the client imported here.
      //
      // Only `410 Gone` is an outcome. A throttle, a timeout or a missing
      // permission is infrastructure failing, and reporting one of those as
      // `gone` would have the caller delete a connection that is still open —
      // permanently, since nothing re-registers it until the browser
      // reconnects.
      if (cause instanceof GoneException) return 'gone';
      throw cause;
    }

    return 'delivered';
  }
}
