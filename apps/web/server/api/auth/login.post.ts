import { useServerRuntime } from '../../utils/auth-runtime';
import { describeSignInFailure, INVALID_INPUT } from '../../utils/auth-failures';
import { credentialsSchema, parseRequest } from '../../utils/auth-requests';
import { createCookieJar, respondWithFailure, type AuthFailureBody } from '../../utils/http';
import { writeSessionCookies } from '../../utils/session-cookie';

export interface SignedInUser {
  readonly email: string;
  readonly subject: string;
}

/**
 * The tokens Cognito returns go straight into httpOnly cookies and are never
 * part of the response body: the browser is told who signed in and nothing it
 * could replay.
 */
export default defineEventHandler(async (event): Promise<SignedInUser | AuthFailureBody> => {
  const credentials = parseRequest(credentialsSchema, await readBody(event));
  if (credentials === null) return respondWithFailure(event, INVALID_INPUT);

  const { gateway } = await useServerRuntime();

  try {
    const session = await gateway.signIn(credentials.email, credentials.password);
    const email = session.email ?? credentials.email;

    writeSessionCookies(createCookieJar(event), {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      subject: session.subject,
      email,
    });

    return { email, subject: session.subject };
  } catch (error) {
    return respondWithFailure(event, describeSignInFailure(error));
  }
});
