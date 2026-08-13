import type { SecretsProvider } from '../../src/domain/ports/secrets-provider.js';

export class FakeSecretsProvider implements SecretsProvider {
  readonly requestedNames: string[] = [];

  /** Set to make the next call reject with this error; cleared after one use. */
  failNextWith?: Error | undefined;

  constructor(private readonly secrets: Record<string, string>) {}

  getSecret(name: string): Promise<string> {
    const failure = this.failNextWith;
    this.failNextWith = undefined;
    if (failure) return Promise.reject(failure);

    this.requestedNames.push(name);

    const value = this.secrets[name];
    return value === undefined
      ? Promise.reject(new Error(`No secret is configured under "${name}"`))
      : Promise.resolve(value);
  }
}
