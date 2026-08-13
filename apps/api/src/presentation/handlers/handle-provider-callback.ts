import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { readRawBody } from '../http/api-gateway-request.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { errorResponse, jsonResponse } from '../http/http-response.js';
import { BAD_REQUEST, OK, UNAUTHORIZED } from '../http/http-status.js';
import { withValidatedQuery } from '../http/validation.js';
import type {
  ApiGatewayRequestEvent,
  ApiGatewayRequestHandler,
  HttpRequest,
  HttpResponse,
} from '../types/http.js';
import type {
  CallbackQuery,
  CompletedOutcome,
  FailedOutcome,
  UnrecognisedOutcome,
} from '../types/events.js';
import type { HandleProviderCallbackDependencies } from '../types/dependencies.js';

const UNAUTHENTICATED_CODE = 'UNAUTHENTICATED';
const UNAUTHENTICATED_MESSAGE = 'This request requires a valid callback credential';

const INVALID_REQUEST_CODE = 'INVALID_REQUEST';

/** Shown to the user; the provider's own status word goes to the log instead. */
const PROVIDER_FAILURE_REASON = 'The transcription provider could not process this recording';

const MAX_IDENTIFIER_LENGTH = 128;

// POST /webhooks/transcription-provider
export const ProviderCallbackQuerySchema = z.object({
  transcriptionId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
  userId: z.string().min(1).max(MAX_IDENTIFIER_LENGTH),
});

export function handleProviderCallbackHandler(
  dependencies: HandleProviderCallbackDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(dependencies.logger, async (request: HttpRequest) => {
    const expectedSecret = await dependencies.secrets.getSecret(dependencies.webhookSecretName);

    if (!secretsMatch(readPresentedSecret(request.event), expectedSecret)) {
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

  await announce(dependencies, request, query);

  return acknowledged(request.requestId);
}

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

function readPresentedSecret(event: ApiGatewayRequestEvent): string {
  const header =
    Object.entries(event.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1] ??
    '';

  return /^Bearer\s+(.*)$/i.exec(header)?.[1] ?? header;
}

function secretsMatch(presented: string, expected: string): boolean {
  const presentedDigest = createHash('sha256').update(presented, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();

  return timingSafeEqual(presentedDigest, expectedDigest);
}
