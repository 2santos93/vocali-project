import { GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';

const sharedSecretCache = new Map<string, Promise<string>>();

export class MissingSecretError extends Error {
  readonly code = 'SECRET_NOT_FOUND';

  constructor(name: string) {
    // The parameter name is a configured path, not a secret, and naming it is
    // the difference between a five-minute fix and an afternoon of guessing.
    super(`Secret "${name}" has no value in Parameter Store`);
    this.name = 'MissingSecretError';
  }
}

export class SsmSecretsProvider implements SecretsProvider {
  constructor(
    private readonly client: SSMClient,
    private readonly cache: Map<string, Promise<string>> = sharedSecretCache,
  ) {}

  getSecret(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached !== undefined) return cached;

    const pending = this.read(name).catch((cause: unknown) => {
      // Caching a rejected promise would turn one transient Parameter Store
      // error into a container that can never fetch that secret again.
      this.cache.delete(name);
      throw cause;
    });

    this.cache.set(name, pending);

    return pending;
  }

  private async read(name: string): Promise<string> {
    const response = await this.client.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );

    const value = response.Parameter?.Value;
    if (value === undefined || value === '') throw new MissingSecretError(name);

    return value;
  }
}
