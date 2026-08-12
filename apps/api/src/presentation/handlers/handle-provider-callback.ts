import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CompleteTranscription } from '../../application/use-cases/complete-transcription.js';
import type { FailTranscription } from '../../application/use-cases/fail-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import {
  buildTranscriptText,
  resolveDurationSeconds,
  SpeechmaticsTranscriptSchema,
  SPEECHMATICS_SUCCESS_STATUS,
} from '../../infrastructure/providers/speechmatics-callback.js';
import type {
  ApiGatewayRequestEvent,
  ApiGatewayRequestHandler,
  HttpRequest,
} from '../http/api-gateway-request.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { errorResponse, jsonResponse, type HttpResponse } from '../http/http-response.js';
import { withValidatedBody, withValidatedQuery } from '../http/validation.js';

const ACCEPTED_STATUS = 200;
const UNAUTHENTICATED_STATUS = 401;
const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a valid callback credential';

/** Shown to the user; the provider's own status word goes to the log instead. */
const PROVIDER_FAILURE_REASON = 'The transcription provider could not process this recording';

const MAX_IDENTIFIER_LENGTH = 128;

/**
 * `transcriptionId` and `userId` are ours, appended to the callback URL when
 * the job was submitted (ruling R12), so the record resolves by primary key
 * rather than through an index. `id` and `status` are the provider's, which
 * it appends to whatever URL it was given.
 */
const ProviderCallbackQuerySchema = z.object({
  transcriptionId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  userId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  id: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  status: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
});

interface Dependencies {
  readonly completeTranscription: CompleteTranscription;
  readonly failTranscription: FailTranscription;
  readonly secrets: SecretsProvider;
  /** Parameter Store path of the shared secret the provider echoes back. */
  readonly webhookSecretName: string;
  readonly logger: Logger;
}

/**
 * `POST /webhooks/transcription-provider` — applies a provider job outcome.
 *
 * This route has no JWT authorizer, because the caller is Speechmatics and it
 * holds no Cognito token. The shared secret it echoes in the `Authorization`
 * header is therefore the *only* thing standing between the open internet and
 * a write into a named user's history. Anyone who learns this URL and gets
 * past that check can fabricate a transcription in any account, so the check
 * runs first, before the query string is looked at, before the body is read,
 * and before any use case is touched.
 *
 * Both outcomes acknowledge with a 2xx when there is nothing left to do. The
 * provider redelivers until it gets one, and the use cases already treat a
 * record that has reached the target state as success without mutating it —
 * a second delivery of a completion must never overwrite a good transcript.
 */
export function handleProviderCallbackHandler(
  dependencies: Dependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(dependencies.logger, async (request: HttpRequest) => {
    const expectedSecret = await dependencies.secrets.getSecret(dependencies.webhookSecretName);

    if (!secretsMatch(readPresentedSecret(request.event), expectedSecret)) {
      // Nothing about the request is logged beyond the correlation id: the
      // body of a forged callback is attacker-controlled, and a rejected
      // credential must not be written to a log where it would sit in
      // plaintext next to the endpoint it was presented to.
      dependencies.logger.info('Rejected a provider callback with an invalid credential', {
        requestId: request.requestId,
      });

      return errorResponse(UNAUTHENTICATED_STATUS, {
        code: UNAUTHENTICATED_CODE,
        message: UNAUTHENTICATED_MESSAGE,
        requestId: request.requestId,
      });
    }

    return withValidatedQuery(ProviderCallbackQuerySchema, (validRequest, query) =>
      query.status === SPEECHMATICS_SUCCESS_STATUS
        ? applyCompletion(dependencies, validRequest, query)
        : applyFailure(dependencies, validRequest, query),
    )(request);
  });
}

type CallbackQuery = z.infer<typeof ProviderCallbackQuerySchema>;

function applyCompletion(
  dependencies: Dependencies,
  request: HttpRequest,
  query: CallbackQuery,
): Promise<HttpResponse> {
  return withValidatedBody(SpeechmaticsTranscriptSchema, async (bodyRequest, transcript) => {
    const result = await dependencies.completeTranscription.execute({
      userId: query.userId,
      transcriptionId: query.transcriptionId,
      externalJobId: query.id,
      text: buildTranscriptText(transcript.results),
      durationSeconds: resolveDurationSeconds(transcript),
    });

    return result.success
      ? acknowledged(bodyRequest.requestId)
      : toErrorResponse(result.error, bodyRequest.requestId);
  })(request);
}

async function applyFailure(
  dependencies: Dependencies,
  request: HttpRequest,
  query: CallbackQuery,
): Promise<HttpResponse> {
  // The provider's own status word is operational detail. `reason` is stored
  // on the record and shown in the history, so it says something a clinician
  // can act on rather than repeating a third party's vocabulary.
  dependencies.logger.info('Provider reported a job it did not complete', {
    requestId: request.requestId,
    transcriptionId: query.transcriptionId,
    providerStatus: query.status,
  });

  const result = await dependencies.failTranscription.execute({
    userId: query.userId,
    transcriptionId: query.transcriptionId,
    externalJobId: query.id,
    reason: PROVIDER_FAILURE_REASON,
  });

  return result.success
    ? acknowledged(request.requestId)
    : toErrorResponse(result.error, request.requestId);
}

function acknowledged(requestId: string): HttpResponse {
  return jsonResponse(ACCEPTED_STATUS, { status: 'accepted' }, requestId);
}

/**
 * The credential the caller presented, or an empty string when it presented
 * none — never a short circuit. An early return for a missing header would
 * answer measurably faster than a wrong secret, and that difference is itself
 * a signal about how the check works.
 *
 * The header is matched case-insensitively: an HTTP API v2 event lowercases
 * header names, a REST API event does not, and a check that silently only
 * works on one of them would fail open on the other.
 */
function readPresentedSecret(event: ApiGatewayRequestEvent): string {
  const header =
    Object.entries(event.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1] ??
    '';

  return /^Bearer\s+(.*)$/i.exec(header)?.[1] ?? header;
}

/**
 * Compares the two secrets in constant time.
 *
 * `timingSafeEqual` throws when the buffers differ in length, and the obvious
 * fix — check the lengths first and return early — reintroduces exactly the
 * leak the function exists to prevent, letting an attacker recover the
 * secret's length one guess at a time. Hashing both sides first makes every
 * comparison examine 32 bytes whatever was presented, so no path through this
 * function depends on the length of the input, and SHA-256's collision
 * resistance means equal digests mean equal secrets.
 *
 * A plain `===` here would compare byte by byte and stop at the first
 * difference, which is enough for a remote attacker to recover the secret
 * character by character given enough samples.
 */
function secretsMatch(presented: string, expected: string): boolean {
  const presentedDigest = createHash('sha256').update(presented, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}
