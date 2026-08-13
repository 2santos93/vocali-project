import { useServerRuntime } from '../../utils/auth-runtime';
import { describeConfirmationFailure, INVALID_INPUT } from '../../utils/auth-failures';
import { confirmationSchema, parseRequest } from '../../utils/auth-requests';
import { respondWithFailure, type AuthFailureBody } from '../../utils/http';

export interface ConfirmationAccepted {
  readonly status: 'CONFIRMED';
}

/** Confirms the address with the code Cognito emailed, completing sign-up. */
export default defineEventHandler(
  async (event): Promise<ConfirmationAccepted | AuthFailureBody> => {
    const confirmation = parseRequest(confirmationSchema, await readBody(event));
    if (confirmation === null) return respondWithFailure(event, INVALID_INPUT);

    const { gateway } = await useServerRuntime();

    try {
      await gateway.confirmRegistration(confirmation.email, confirmation.code);
    } catch (error) {
      return respondWithFailure(event, describeConfirmationFailure(error));
    }

    // Still no session: confirmation proves the address, not the password.
    return { status: 'CONFIRMED' };
  },
);
