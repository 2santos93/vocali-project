import { useServerRuntime } from '../../utils/auth-runtime';
import { describeRegistrationFailure, INVALID_INPUT } from '../../utils/auth-failures';
import { credentialsSchema, parseRequest } from '../../utils/auth-requests';
import { respondWithFailure, type AuthFailureBody } from '../../utils/http';

export interface RegistrationAccepted {
  readonly status: 'CONFIRMATION_REQUIRED';
  readonly email: string;
}

export default defineEventHandler(
  async (event): Promise<RegistrationAccepted | AuthFailureBody> => {
    const credentials = parseRequest(credentialsSchema, await readBody(event));
    if (credentials === null) return respondWithFailure(event, INVALID_INPUT);

    const { gateway } = await useServerRuntime();

    try {
      await gateway.register(credentials.email, credentials.password);
    } catch (error) {
      const failure = describeRegistrationFailure(error);
      if (failure !== null) return respondWithFailure(event, failure);
    }

    // No cookie here: issuing a session now would let an unverified address
    // reach protected resources.
    return { status: 'CONFIRMATION_REQUIRED', email: credentials.email };
  },
);
