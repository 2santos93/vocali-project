import type { Logger } from '../../domain/ports/logger.js';
import type { DomainErrorCode } from '@vocali/contracts/constants';

export interface ApiGatewayRequestEvent {
  readonly requestContext: {
    readonly requestId: string;
    readonly authorizer?: {
      readonly jwt?: {
        readonly claims?: Record<string, unknown> | null;
      };
    };
  };
  readonly headers: Record<string, string | undefined>;
  readonly pathParameters?: Record<string, string | undefined> | null;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
  readonly body?: string | undefined;
  readonly isBase64Encoded?: boolean;
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export type ApiGatewayRequestHandler = (event: ApiGatewayRequestEvent) => Promise<HttpResponse>;

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

export interface AuthenticatedHttpRequest extends HttpRequest {
  readonly userId: string;
}

export interface RecognisedDomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}
