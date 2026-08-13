import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@vocali/contracts/constants';
import type { Logger } from '../../domain/ports/logger.js';
import type {
  ApiGatewayRequestHandler,
  ApiGatewayRequestEvent,
  HttpRequest,
} from './api-gateway-request.js';
import { errorResponse, type HttpResponse } from './http-response.js';
import { BAD_REQUEST, CONFLICT, INTERNAL_SERVER_ERROR, NOT_FOUND } from './http-status.js';

/**
 * One code and one sentence for everything the client cannot act on. The
 * `requestId` in the same body is what turns it into something an operator
 * can act on, without the client ever seeing why.
 */
const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
const INTERNAL_ERROR_MESSAGE = 'The request could not be completed';

/**
 * Every domain error code, mapped to the status the client should see.
 *
 * Exhaustive by type, not by convention: `Record<DomainErrorCode, number>`
 * means a new domain error cannot be added without a status being chosen for
 * it here. The alternative — a partial map with a 500 default — compiles
 * happily and turns a new, perfectly explainable 400 into an opaque 500 that
 * nobody notices until a user reports it.
 *
 * The two 5xx entries are deliberate rather than left to the fallback.
 * `INVALID_STATUS_TRANSITION` only reaches a client through the provider
 * webhook, where it means the record moved underneath the callback — an
 * anomaly on this side, not a mistake the caller made. `TRANSCRIPTION_PROVIDER_FAILED`
 * is likewise ours: the caller's request was fine and a third party was not.
 * Both are answered with the generic body below, so neither message escapes.
 */
const STATUS_BY_DOMAIN_ERROR_CODE: Record<DomainErrorCode, number> = {
  UNSUPPORTED_AUDIO_FORMAT: BAD_REQUEST,
  INVALID_AUDIO_FILE_SIZE: BAD_REQUEST,
  AUDIO_FILE_TOO_LARGE: BAD_REQUEST,
  INVALID_AUDIO_FILE_NAME: BAD_REQUEST,
  INVALID_CURSOR: BAD_REQUEST,
  TRANSCRIPTION_NOT_FOUND: NOT_FOUND,
  TRANSCRIPTION_NOT_READY: CONFLICT,
  INVALID_STATUS_TRANSITION: INTERNAL_SERVER_ERROR,
  TRANSCRIPTION_PROVIDER_FAILED: INTERNAL_SERVER_ERROR,
};

interface RecognisedDomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
}

/**
 * Translates a domain error — thrown or returned — into a client response.
 *
 * Anything not recognised as a domain error becomes a generic 500. That
 * includes every infrastructure failure: a DynamoDB throttle, a malformed
 * stored record, an AWS SDK timeout. Their messages name tables, buckets,
 * parameter paths and sometimes object keys, and an object key here contains
 * a user id and a clinical file name.
 */
export function toErrorResponse(error: unknown, requestId: string): HttpResponse {
  const domainError = recogniseDomainError(error);
  if (domainError === null) return internalErrorResponse(requestId);

  const statusCode = STATUS_BY_DOMAIN_ERROR_CODE[domainError.code];
  if (statusCode >= INTERNAL_SERVER_ERROR) return internalErrorResponse(requestId);

  // Safe to forward: domain error messages are written for the person who
  // made the request, and each is built from validated input or from the
  // caller's own identifiers — never from a stored value or a provider
  // response. `InvalidAudioFileNameError` carries a reason rather than the
  // rejected name for exactly that reason.
  return errorResponse(statusCode, {
    code: domainError.code,
    message: domainError.message,
    requestId,
  });
}

export function internalErrorResponse(requestId: string): HttpResponse {
  return errorResponse(INTERNAL_SERVER_ERROR, {
    code: INTERNAL_ERROR_CODE,
    message: INTERNAL_ERROR_MESSAGE,
    requestId,
  });
}

/**
 * The outermost wrapper on every HTTP handler: it mints the correlation id,
 * and it guarantees that nothing escapes as an unhandled rejection.
 *
 * A Lambda that rejects returns API Gateway's own error page, which carries
 * no `requestId` the client can quote and, on some integrations, the raw
 * exception message. Catching here means a failure is always a body this
 * codebase wrote.
 */
export function withErrorMapping(
  logger: Logger,
  handler: (request: HttpRequest) => Promise<HttpResponse>,
): ApiGatewayRequestHandler {
  return async (event: ApiGatewayRequestEvent): Promise<HttpResponse> => {
    const requestId = event.requestContext.requestId;
    // Bound once, here, and handed to the handler. Every line written under
    // this request then carries the id the client was quoted, whether or not
    // whoever wrote that line thought about correlation — which is the
    // difference between a convention and a guarantee. It reaches the log
    // under the same name the client receives, so an operator handed a
    // `requestId` can filter on it without translating anything.
    const requestLogger = logger.withCorrelationId(requestId);

    try {
      return await handler({ event, requestId, logger: requestLogger });
    } catch (cause: unknown) {
      // The detail the client is denied goes here instead, under the same id
      // the client was given. That pairing is the whole point of the generic
      // response: nothing is hidden, it is only moved somewhere the person
      // who can act on it can read it.
      requestLogger.error('Request failed and was answered with a generic error', {
        ...describeThrown(cause),
      });

      return toErrorResponse(cause, requestId);
    }
  };
}

/**
 * Recognises a domain error by its `code` alone.
 *
 * Never `instanceof`, never `name`. esbuild mangles class names, so a
 * minified bundle's `TranscriptionNotFoundError` may be called `t` — and
 * `instanceof` asks whether a value was built by *this* module's copy of a
 * constructor, which stops being true the moment two bundles or two realms
 * are involved. The `code` is a string literal the entity declares; it
 * survives both.
 */
function recogniseDomainError(error: unknown): RecognisedDomainError | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.code !== 'string' || typeof candidate.message !== 'string') return null;
  if (!isDomainErrorCode(candidate.code)) return null;

  return { code: candidate.code, message: candidate.message };
}

function isDomainErrorCode(code: string): code is DomainErrorCode {
  return (DOMAIN_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * Duck-typed for the same reason the mapper above is: `instanceof Error`
 * answers a question about constructor identity, and a rejected value can be
 * anything at all — including a string a library threw.
 */
function describeThrown(cause: unknown): Record<string, unknown> {
  if (typeof cause !== 'object' || cause === null) {
    return { errorMessage: 'a non-object value was thrown', errorCode: null, stack: null };
  }

  const candidate = cause as { message?: unknown; code?: unknown; stack?: unknown };

  return {
    errorMessage: typeof candidate.message === 'string' ? candidate.message : 'no message',
    errorCode: typeof candidate.code === 'string' ? candidate.code : null,
    stack: typeof candidate.stack === 'string' ? candidate.stack : null,
  };
}
