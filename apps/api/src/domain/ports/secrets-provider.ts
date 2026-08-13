/**
 * Reads a named secret at runtime — an SSM Parameter Store name in production.
 * Secrets never arrive through environment variables: a plaintext Lambda
 * variable is visible to anyone who can describe the function.
 */
export interface SecretsProvider {
  getSecret(name: string): Promise<string>;
}
