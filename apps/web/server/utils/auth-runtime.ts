import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { createCognitoGateway, type CognitoGateway } from './cognito-gateway';

/**
 * Where the server's configuration comes from, and where the client secret
 * does not come from.
 *
 * The user pool id, the app client id and the API's base URL are ordinary
 * configuration and arrive as environment variables. The app client secret
 * does not: what the environment carries is the *path* to a SecureString
 * parameter, and the value is read from Parameter Store at runtime and
 * decrypted there. The same arrangement the API uses for the provider key, and
 * the reason no secret appears in this repository, in a variable default, or
 * in a plaintext environment variable.
 */

export class MissingConfigurationError extends Error {
  constructor(name: string) {
    // The name of a setting is not a secret, and naming it is the difference
    // between a five-minute fix and an afternoon of guessing.
    super(`Runtime configuration "${name}" is not set`);
    this.name = 'MissingConfigurationError';
  }
}

export class MissingSecretError extends Error {
  constructor(parameter: string) {
    super(`Parameter "${parameter}" has no value in Parameter Store`);
    this.name = 'MissingSecretError';
  }
}

/*
 * Module scope, so a warm server process reads the parameter once and builds
 * one Cognito client no matter how many requests arrive. The promise is cached
 * rather than the resolved value, so two requests during a cold start share a
 * single Parameter Store call instead of racing to make two.
 */
let gatewayPromise: Promise<CognitoGateway> | null = null;

export interface ServerRuntime {
  readonly gateway: CognitoGateway;
  readonly apiBaseUrl: string;
}

export function useServerRuntime(): Promise<ServerRuntime> {
  const config = useRuntimeConfig();
  const apiBaseUrl = requireSetting(config.apiBaseUrl, 'apiBaseUrl');

  gatewayPromise ??= buildGateway({
    region: requireSetting(config.cognito.region, 'cognito.region'),
    userPoolId: requireSetting(config.cognito.userPoolId, 'cognito.userPoolId'),
    clientId: requireSetting(config.cognito.clientId, 'cognito.clientId'),
    clientSecretParameter: requireSetting(
      config.cognito.clientSecretParameter,
      'cognito.clientSecretParameter',
    ),
  }).catch((cause: unknown) => {
    // A rejection must not be remembered. Caching it would turn one transient
    // Parameter Store error into a process that can never sign anybody in
    // again for the rest of its life.
    gatewayPromise = null;
    throw cause;
  });

  return gatewayPromise.then((gateway) => ({ gateway, apiBaseUrl }));
}

/** Test seam, and the way a redeployed secret is picked up without a restart. */
export function resetServerRuntime(): void {
  gatewayPromise = null;
}

interface GatewaySettings {
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly clientSecretParameter: string;
}

async function buildGateway(settings: GatewaySettings): Promise<CognitoGateway> {
  const ssm = new SSMClient({ region: settings.region });

  const response = await ssm.send(
    // `WithDecryption`, because the parameter is a SecureString. Without it
    // the call succeeds and hands back the ciphertext, which then travels
    // onwards as if it were the secret and fails every signature silently.
    new GetParameterCommand({ Name: settings.clientSecretParameter, WithDecryption: true }),
  );

  const clientSecret = response.Parameter?.Value;
  if (clientSecret === undefined || clientSecret === '') {
    throw new MissingSecretError(settings.clientSecretParameter);
  }

  return createCognitoGateway({
    region: settings.region,
    userPoolId: settings.userPoolId,
    clientId: settings.clientId,
    clientSecret,
  });
}

/**
 * Fails at the first request rather than defaulting.
 *
 * A missing pool id that defaults to an empty string produces
 * `ResourceNotFoundException` from Cognito, which the failure translation
 * quite correctly reports to the user as "vuelve a intentarlo en unos
 * minutos" — advice that will never work. Naming the setting turns a
 * mysterious outage into a deployment fix.
 */
function requireSetting(value: string, name: string): string {
  if (value === '') throw new MissingConfigurationError(name);

  return value;
}
