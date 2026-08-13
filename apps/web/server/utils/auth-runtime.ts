import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { createCognitoGateway, type CognitoGateway } from './cognito-gateway';

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
    // A rejection must not be remembered: caching it turns one transient
    // Parameter Store error into a process that can never sign anybody in
    // again.
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

function requireSetting(value: string, name: string): string {
  if (value === '') throw new MissingConfigurationError(name);

  return value;
}
