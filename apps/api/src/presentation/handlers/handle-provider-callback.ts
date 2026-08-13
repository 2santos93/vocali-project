import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CompleteTranscription } from '../../application/use-cases/complete-transcription.js';
import type { FailTranscription } from '../../application/use-cases/fail-transcription.js';
import type { PublishTranscriptionUpdate } from '../../application/use-cases/publish-transcription-update.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { SecretsProvider } from '../../domain/ports/secrets-provider.js';
import type {
  ProviderJobOutcome,
  TranscriptionProvider,
} from '../../domain/ports/transcription-provider.js';
import {
  readRawBody,
  type ApiGatewayRequestEvent,
  type ApiGatewayRequestHandler,
  type HttpRequest,
} from '../http/api-gateway-request.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { errorResponse, jsonResponse, type HttpResponse } from '../http/http-response.js';
import { BAD_REQUEST, OK, UNAUTHORIZED } from '../http/http-status.js';
import { withValidatedQuery } from '../http/validation.js';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a valid callback credential';

const INVALID_REQUEST_CODE = 'INVALID_REQUEST';

/** Shown to the user; the provider's own status word goes to the log instead. */
const PROVIDER_FAILURE_REASON = 'The transcription provider could not process this recording';

const MAX_IDENTIFIER_LENGTH = 128;

/**
 * `transcriptionId` and `userId` are ours, appended to the callback URL when
 * the job was submitted (ruling R12), so the record resolves by primary key
 * rather than through an index.
 *
 * Only ours. Whatever else the provider appended is passed on untouched for
 * the provider's own adapter to read, because which parameter carries a job id
 * and which carries a status is a fact about one vendor, and this route is the
 * last place that should have to be edited when the vendor changes.
 */
const ProviderCallbackQuerySchema = z.object({
  transcriptionId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  userId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
});

interface Dependencies {
  readonly completeTranscription: CompleteTranscription;
  readonly failTranscription: FailTranscription;
  readonly publishTranscriptionUpdate: PublishTranscriptionUpdate;
  readonly transcriptionProvider: TranscriptionProvider;
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
      // Nothing about the request is logged beyond the correlation id the
      // request logger already carries: the body of a forged callback is
      // attacker-controlled, and a rejected credential must not be written to
      // a log where it would sit in plaintext next to the endpoint it was
      // presented to.
      request.logger.warn('Rejected a provider callback with an invalid credential');

      return errorResponse(UNAUTHORIZED, {
        code: UNAUTHENTICATED_CODE,
        message: UNAUTHENTICATED_MESSAGE,
        requestId: request.requestId,
      });
    }

    return withValidatedQuery(ProviderCallbackQuerySchema, async (validRequest, query) => {
      // The body is handed over as it was sent. Reading it is the provider
      // adapter's business, and a JSON parse here would already be an
      // assumption about a payload format this layer has no reason to hold.
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

type CallbackQuery = z.infer<typeof ProviderCallbackQuerySchema>;

type CompletedOutcome = Extract<ProviderJobOutcome, { kind: 'completed' }>;
type FailedOutcome = Extract<ProviderJobOutcome, { kind: 'failed' }>;
type UnrecognisedOutcome = Extract<ProviderJobOutcome, { kind: 'unrecognised' }>;

async function applyCompletion(
  dependencies: Dependencies,
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
  dependencies: Dependencies,
  request: HttpRequest,
  query: CallbackQuery,
  outcome: FailedOutcome,
): Promise<HttpResponse> {
  // The provider's own status word is operational detail. `reason` is stored
  // on the record and shown in the history, so it says something a clinician
  // can act on rather than repeating a third party's vocabulary.
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

  // A failure is pushed too. The browser is waiting on this record either way,
  // and a client told only about successes waits out its whole fallback budget
  // before discovering a transcription that failed in ten seconds.
  await announce(dependencies, request, query);

  return acknowledged(request.requestId);
}

/**
 * Pushes the settled record to whatever sockets its owner has open.
 *
 * **This can never fail the callback**, and the `catch` is not defensive
 * padding. The provider redelivers until it gets a 2xx, so an exception
 * escaping here would have a completed transcription reported as undelivered
 * and retried — and, if the same exception recurred, eventually abandoned. A
 * browser that closed its laptop lid must not be able to cause that.
 *
 * The record is already written by the time this runs. Everything below this
 * line is a notification, and the history is the source of truth a client
 * falls back to.
 *
 * `PublishTranscriptionUpdate` swallows a departed connection and a failed
 * publish on its own; this is the second guard, and both are right, because
 * the cost of being wrong is a lost transcript.
 */
async function announce(
  dependencies: Dependencies,
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
 * A callback the provider's own adapter could not make sense of. Answered 400
 * and never applied: the two writes below this point both need a job id to
 * prove the callback belongs to the record it names, and without one there is
 * nothing to check a forged or garbled delivery against.
 *
 * The reason is written by the adapter and is a fixed sentence, so nothing the
 * sender chose is reflected back to it.
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
