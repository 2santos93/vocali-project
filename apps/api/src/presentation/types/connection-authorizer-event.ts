/**
 * A websocket `$connect` request as a Lambda REQUEST authorizer sees it.
 */
export interface ConnectionAuthorizerEvent {
  /** The route being authorised. The policy is scoped to exactly this. */
  readonly methodArn: string;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}
