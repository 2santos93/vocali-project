export interface SecretsProvider {
  getSecret(name: string): Promise<string>;
}
