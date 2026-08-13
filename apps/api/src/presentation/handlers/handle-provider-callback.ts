import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { readRawBody } from '../http/api-gateway-request.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { errorResponse, jsonResponse } from '../http/http-response.js';
import { BAD_REQUEST, OK, UNAUTHORIZED } from '../http/http-status.js';
import { withValidatedQuery } from '../http/validation.js';
import type { ApiGatewayRequestEvent } from '../types/api-gateway-request-event.js';
import type { ApiGatewayRequestHandler } from '../types/api-gateway-request-handler.js';
import type { CallbackQuery } from '../types/callback-query.js';
import type { CompletedOutcome } from '../types/completed-outcome.js';
import type { FailedOutcome } from '../types/failed-outcome.js';
import type { HandleProviderCallbackDependencies } from '../types/handle-provider-callback-dependencies.js';
import type { HttpRequest } from '../types/http-request.js';
import type { HttpResponse } from '../types/http-response.js';
import type { UnrecognisedOutcome } from '../types/unrecognised-outcome.js';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a valid callback credential';

const INVALID_REQUEST_CODE = 'INVALID_REQUEST';

/** Shown to the user; the provider's own status word goes to the log instead. */
const PROVIDER_FAILURE_REASON = 'The transcription provider could not process this recording';

const MAX_IDENTIFIER_LENGTH = 128;

/**
 * Only the two parameters that are ours, appended to the callback URL at
 * submission so the record resolves by primary key. Whatever else the provider
 * appended is passed on untouched for its own adapter to read, because which
 * parameter carries a job id is a fact about one vendor.
 */
export const ProviderCallbackQuerySchema = z.object({
  transcriptionId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  userId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
});

/**
 * `POST /webhooks/transcription-provider`.
 *
 * This route has no JWT authorizer — the caller is the provider and holds no
 * Cognito token — so the shared secret it echoes in the `Authorization` header
 * is the *only* thing between the open internet and a write into a named
 * user's history. The check therefore runs first: before the query string is
 * looked at, before the body is read, before any use case is touched.
 */
export function handleProviderCallbackHandler(
  dependencies: HandleProviderCallbackDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(dependencies.logger, async (request: HttpRequest) => {
    const expectedSecret = await dependencies.secrets.getSecret(dependencies.webhookSecretName);

    if (!secretsMatch(readPresentedSecret(request.event), expectedSecret)) {
      // Nothing about the request is logged beyond the correlation id: the
      // body of a forged callback is attacker-controlled, and a rejected
      // credential must not sit in plaintext beside the endpoint it was
      // presented to.
      request.logger.warn('Rejected a provider callback with an invalid credential');

      return errorResponse(UNAUTHORIZED, {
        code: UNAUTHENTICATED_CODE,
        message: UNAUTHENTICATED_MESSAGE,
        requestId: request.requestId,
      });
    }

    return withValidatedQuery(ProviderCallbackQuerySchema, async (validRequest, query) => {
      // Handed over as it was sent: a JSON parse here would be an assumption
      // about a payload format this layer has no reason to hold.
      const outcome = await dependencies.transcriptionProvider.interpretCallback({
        query: validRequest.event.queryStringParameters ?? {},
        body: readRawBody(validRequest.event),
      });

      switch (outcome.kind) {
        case 'completed':
          return applyCompletion(dependencies, validRequest, query, outcome);
        case 'failed':
          return applyFailure(dependencies, validRequest, query, outcome);
        case 'unrecognised':
          return rejectUnrecognised(validRequest, outcome);
      }
    })(request);
  });
}

async function applyCompletion(
  dependencies: HandleProviderCallbackDependencies,
  request: HttpRequest,
  query: CallbackQuery,
  outcome: CompletedOutcome,
): Promise<HttpResponse> {
  const result = await dependencies.completeTranscription.execute({
    userId: query.userId,
    transcriptionId: query.transcriptionId,
    externalJobId: outcome.externalJobId,
    text: outcome.text,
    durationSeconds: outcome.durationSeconds,
    language: outcome.language,
  });

  if (!result.success) {
    return toErrorResponse(result.error, request.requestId);
  }

  await announce(dependencies, request, query);

  return acknowledged(request.requestId);
}

async function applyFailure(
  dependencies: HandleProviderCallbackDependencies,
  request: HttpRequest,
  query: CallbackQuery,
  outcome: FailedOutcome,
): Promise<HttpResponse> {
  // The provider's status word goes to the log; `reason` is stored on the
  // record and shown in the history, so it says something a clinician can act
  // on rather than repeating a third party's vocabulary.
  request.logger.warn('Provider reported a job it did not complete', {
    transcriptionId: query.transcriptionId,
    providerStatus: outcome.providerStatus,
  });

  const result = await dependencies.failTranscription.execute({
    userId: query.userId,
    transcriptionId: query.transcriptionId,
    externalJobId: outcome.externalJobId,
    reason: PROVIDER_FAILURE_REASON,
  });

  if (!result.success) {
    return toErrorResponse(result.error, request.requestId);
  }

  // A failure is pushed too: a client told only about successes waits out its
  // whole fallback budget before discovering a transcription that failed in
  // ten seconds.
  await announce(dependencies, request, query);

  return acknowledged(request.requestId);
}

/**
 * **This can never fail the callback**, and the `catch` is not defensive
 * padding. The record is already written; everything here is a notification.
 * An exception escaping would have the provider retry a completed
 * transcription and eventually abandon it, and a browser that closed its
 * laptop lid must not be able to cause that.
 *
 * `PublishTranscriptionUpdate` holds a guard of its own. Both are right,
 * because the cost of being wrong is a lost transcript.
 */
async function announce(
  dependencies: HandleProviderCallbackDependencies,
  request: HttpRequest,
  query: CallbackQuery,
): Promise<void> {
  try {
    await dependencies.publishTranscriptionUpdate.execute({
      userId: query.userId,
      transcriptionId: query.transcriptionId,
    });
  } catch {
    request.logger.warn('Could not announce a settled transcription to its open connections', {
      transcriptionId: query.transcriptionId,
    });
  }
}

/**
 * Answered 400 and never applied: both writes need a job id to prove the
 * callback belongs to the record it names. The reason is a fixed sentence the
 * adapter wrote, so nothing the sender chose is reflected back to it.
 */
function rejectUnrecognised(
  request: HttpRequest,
  outcome: UnrecognisedOutcome,
): Promise<HttpResponse> {
  request.logger.warn('Could not interpret a provider callback', { reason: outcome.reason });

  return Promise.resolve(
    errorResponse(BAD_REQUEST, {
      code: INVALID_REQUEST_CODE,
      message: outcome.reason,
      requestId: request.requestId,
    }),
  );
}

function acknowledged(requestId: string): HttpResponse {
  return jsonResponse(OK, { status: 'accepted' }, requestId);
}

/**
 * An empty string when nothing was presented, never a short circuit: an early
 * return for a missing header answers measurably faster than a wrong secret.
 *
 * Matched case-insensitively — an HTTP API v2 event lowercases header names, a
 * REST API event does not, and a check that works on only one fails open.
 */
function readPresentedSecret(event: ApiGatewayRequestEvent): string {
  const header =
    Object.entries(event.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1] ??
    '';

  return /^Bearer\s+(.*)$/i.exec(header)?.[1] ?? header;
}

/**
 * Constant time. A plain `===` stops at the first differing byte, which is
 * enough for a remote attacker to recover the secret character by character.
 *
 * Both sides are hashed first because `timingSafeEqual` throws on buffers of
 * different length, and the obvious fix — compare lengths and return early —
 * leaks the secret's length one guess at a time. Digests make every comparison
 * examine 32 bytes whatever was presented.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const presentedDigest = createHash('sha256').update(presented, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}
