export interface ConnectionAuthorizerResult {
  readonly principalId: string;
  /**
   * Mutable, unlike everything else this layer declares, and deliberately so:
   * AWS's `APIGatewayAuthorizerResult` types the statements as a mutable array
   * and a `readonly` one is not assignable to it. The entry point declares its
   * export as AWS's type, so keeping this assignable is what makes that
   * declaration a real check.
   */
  readonly policyDocument: {
    Version: string;
    Statement: {
      Action: string;
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }[];
  };
  /**
   * API Gateway hands this back on every later route of the same connection,
   * which is how `$disconnect` knows whose socket closed without trusting
   * anything the client sent. Values are strings because API Gateway
   * stringifies them anyway, and a number arriving as `"1"` is a run-time bug.
   */
  readonly context?: Record<string, string>;
}
