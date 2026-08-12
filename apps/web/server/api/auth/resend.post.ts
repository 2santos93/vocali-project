import { useServerRuntime } from '../../utils/auth-runtime';
import { describeResendFailure, INVALID_INPUT } from '../../utils/auth-failures';
import { parseRequest, resendSchema } from '../../utils/auth-requests';
import { respondWithFailure, type AuthFailureBody } from '../../utils/http';

export interface ResendAccepted {
  readonly status: 'CODE_SENT';
}

/**
 * Sends a fresh confirmation code, and is the way out of an expired one.
 *
 * A code that has expired is the ordinary path, not an edge case: the message
 * sits in an inbox while the user does something else, and by the time they
 * come back it is dead. Without this route the confirmation screen is a dead
 * end and the account can never be used.
 *
 * The reply is `CODE_SENT` whatever happened — unknown address, already
 * confirmed, or a code genuinely on its way. Reporting the difference would
 * make this the enumeration endpoint that the registration route deliberately
 * is not.
 */
export default defineEventHandler(async (event): Promise<ResendAccepted | AuthFailureBody> => {
  const request = parseRequest(resendSchema, await readBody(event));
  if (request === null) return respondWithFailure(event, INVALID_INPUT);

  const { gateway } = await useServerRuntime();

  try {
    await gateway.resendConfirmationCode(request.email);
  } catch (error) {
    const failure = describeResendFailure(error);
    if (failure !== null) return respondWithFailure(event, failure);
  }

  return { status: 'CODE_SENT' };
});
