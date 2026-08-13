export interface WebSocketRequestEvent {
  readonly requestContext: {
    /** API Gateway's handle for the socket; the management API accepts it. */
    readonly connectionId: string;
    readonly requestId: string;
    readonly authorizer?: Record<string, unknown> | null;
  };
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}

export interface WebSocketResponse {
  readonly statusCode: number;
}

export type WebSocketHandler = (event: WebSocketRequestEvent) => Promise<WebSocketResponse>;

/**
 * A websocket `$connect` request as a Lambda REQUEST authorizer sees it.
 */
export interface ConnectionAuthorizerEvent {
  /** The route being authorised. The policy is scoped to exactly this. */
  readonly methodArn: string;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}

export interface ConnectionAuthorizerResult {
  readonly principalId: string;
  readonly policyDocument: {
    Version: string;
    Statement: {
      Action: string;
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }[];
  };
  readonly context?: Record<string, string>;
}

export type ConnectionAuthorizer = (
  event: ConnectionAuthorizerEvent,
) => Promise<ConnectionAuthorizerResult>;
