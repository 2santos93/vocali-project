import {
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { computeSecretHash } from './secret-hash';
import { readTokenClaims } from './token-claims';

export interface CognitoConfiguration {
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly subject: string;
  readonly email: string | null;
}

export interface CognitoGateway {
  register(email: string, password: string): Promise<void>;
  confirmRegistration(email: string, code: string): Promise<void>;
  resendConfirmationCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<IssuedSession>;
  refreshAccessToken(refreshToken: string, subject: string): Promise<string>;
  signOutEverywhere(accessToken: string): Promise<void>;
}

export class CognitoResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CognitoResponseError';
  }
}

const REQUEST_TIMEOUT_MS = 5000;
const CONNECTION_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 3;

export function createCognitoGateway(configuration: CognitoConfiguration): CognitoGateway {
  const client = new CognitoIdentityProviderClient({
    region: configuration.region,
    maxAttempts: MAX_ATTEMPTS,
    requestHandler: {
      requestTimeout: REQUEST_TIMEOUT_MS,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
    },
  });

  const secretHashFor = (username: string): string =>
    computeSecretHash(username, configuration.clientId, configuration.clientSecret);

  return {
    async register(email: string, password: string): Promise<void> {
      await client.send(
        new SignUpCommand({
          ClientId: configuration.clientId,
          SecretHash: secretHashFor(email),
          Username: email,
          Password: password,
          // The pool's username attribute is the email address, so Cognito
          // needs it as an attribute too in order to send the code to it.
          UserAttributes: [{ Name: 'email', Value: email }],
        }),
      );
    },

    async confirmRegistration(email: string, code: string): Promise<void> {
      await client.send(
        new ConfirmSignUpCommand({
          ClientId: configuration.clientId,
          SecretHash: secretHashFor(email),
          Username: email,
          ConfirmationCode: code,
        }),
      );
    },

    async resendConfirmationCode(email: string): Promise<void> {
      await client.send(
        new ResendConfirmationCodeCommand({
          ClientId: configuration.clientId,
          SecretHash: secretHashFor(email),
          Username: email,
        }),
      );
    },

    async signIn(email: string, password: string): Promise<IssuedSession> {
      const response = await client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: configuration.clientId,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password,
            SECRET_HASH: secretHashFor(email),
          },
        }),
      );

      const result = response.AuthenticationResult;
      const accessToken = result?.AccessToken;
      const refreshToken = result?.RefreshToken;

      if (accessToken === undefined || refreshToken === undefined) {
        throw new CognitoResponseError('Cognito returned no tokens for a password sign-in');
      }

      const claims = readTokenClaims(accessToken);
      if (claims === null) {
        throw new CognitoResponseError('Cognito returned an access token with no readable claims');
      }

      const identity = result?.IdToken === undefined ? null : readTokenClaims(result.IdToken);

      return {
        accessToken,
        refreshToken,
        subject: claims.subject,
        email: identity?.email ?? null,
      };
    },

    async refreshAccessToken(refreshToken: string, subject: string): Promise<string> {
      const response = await client.send(
        new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: configuration.clientId,
          AuthParameters: {
            REFRESH_TOKEN: refreshToken,
            SECRET_HASH: secretHashFor(subject),
          },
        }),
      );

      const accessToken = response.AuthenticationResult?.AccessToken;
      if (accessToken === undefined) {
        throw new CognitoResponseError('Cognito returned no access token for a refresh');
      }

      return accessToken;
    },

    async signOutEverywhere(accessToken: string): Promise<void> {
      await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    },
  };
}
