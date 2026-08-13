import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestEvent } from './api-gateway-request-event.js';

export interface HttpRequest {
  readonly event: ApiGatewayRequestEvent;
  /** The API Gateway request id, echoed to the client in the body and the header. */
  readonly requestId: string;
  /**
   * Already bound to `requestId`, so a handler correlates its lines by using
   * this logger rather than remembering to stamp the id itself.
   */
  readonly logger: Logger;
}
