import { useServerRuntime } from '../../utils/auth-runtime';
import { describeResendFailure, INVALID_INPUT } from '../../utils/auth-failures';
import { parseRequest, resendSchema } from '../../utils/auth-requests';
import { respondWithFailure, type AuthFailureBody } from '../../utils/http';

export interface ResendAccepted {
  readonly status: 'CODE_SENT';
}

/**
 * The reply is `CODE_SENT` whatever happened — unknown address, already
 * confirmed, or a code genuinely on its way. Reporting the difference would
 * make this the enumeration endpoint the registration route is not.
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
