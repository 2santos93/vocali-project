/**
 * Reads a named secret at runtime — an SSM Parameter Store name in production.
 *
 * The port is deliberately one method wide. There is no list, no write and no
 * way to enumerate names, so nothing that holds this port can do more than
 * fetch the one value it was configured to need. Secrets never arrive through
 * environment variables: a plaintext Lambda variable is visible to anyone who
 * can describe the function.
 */
export interface SecretsProvider {
  getSecret(name: string): Promise<string>;
}
