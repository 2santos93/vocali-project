import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@vocali/contracts/constants';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestEvent } from '../types/api-gateway-request-event.js';
import type { ApiGatewayRequestHandler } from '../types/api-gateway-request-handler.js';
import type { HttpRequest } from '../types/http-request.js';
import type { HttpResponse } from '../types/http-response.js';
import type { RecognisedDomainError } from '../types/recognised-domain-error.js';
import { errorResponse } from './http-response.js';
import { BAD_REQUEST, CONFLICT, INTERNAL_SERVER_ERROR, NOT_FOUND } from './http-status.js';

const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
const INTERNAL_ERROR_MESSAGE = 'The request could not be completed';

/**
 * Exhaustive by type, not by convention: `Record<DomainErrorCode, number>`
 * means a new domain error cannot be added without a status chosen for it here.
 * A partial map with a 500 default compiles happily and turns a perfectly
 * explainable 400 into an opaque 500 nobody notices until a user reports it.
 *
 * The two 5xx entries are deliberate rather than left to that fallback: both
 * describe something wrong on this side, not a mistake the caller made.
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

/**
 * Anything not recognised as a domain error becomes a generic 500, which
 * includes every infrastructure failure. Their messages name tables, buckets,
 * parameter paths and object keys, and an object key here contains a user id
 * and a clinical file name.
 */
export function toErrorResponse(error: unknown, requestId: string): HttpResponse {
  const domainError = recogniseDomainError(error);
  if (domainError === null) return internalErrorResponse(requestId);

  const statusCode = STATUS_BY_DOMAIN_ERROR_CODE[domainError.code];
  if (statusCode >= INTERNAL_SERVER_ERROR) return internalErrorResponse(requestId);

  // Safe to forward: every domain error message is built from validated input
  // or the caller's own identifiers, never from a stored value or a provider
  // response.
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
 * The outermost wrapper on every HTTP handler. A Lambda that rejects returns
 * API Gateway's own error page, which carries no `requestId` the client can
 * quote and, on some integrations, the raw exception message. Catching here
 * means a failure is always a body this codebase wrote.
 */
export function withErrorMapping(
  logger: Logger,
  handler: (request: HttpRequest) => Promise<HttpResponse>,
): ApiGatewayRequestHandler {
  return async (event: ApiGatewayRequestEvent): Promise<HttpResponse> => {
    const requestId = event.requestContext.requestId;
    // Bound once and handed to the handler, so every line written under this
    // request carries the id the client was quoted whether or not its author
    // thought about correlation. That is the difference between a convention
    // and a guarantee.
    const requestLogger = logger.withCorrelationId(requestId);

    try {
      return await handler({ event, requestId, logger: requestLogger });
    } catch (cause: unknown) {
      // The detail the client is denied goes here instead, under the same id
      // the client was given. Nothing is hidden; it is moved somewhere only
      // the person who can act on it reads.
      requestLogger.error('Request failed and was answered with a generic error', {
        ...describeThrown(cause),
      });

      return toErrorResponse(cause, requestId);
    }
  };
}

/**
 * By `code` alone; never `instanceof`, never `name`. esbuild mangles class
 * names, and `instanceof` asks whether a value was built by *this* module's
 * copy of a constructor, which stops being true across bundles or realms. The
 * `code` is a string literal the entity declares and survives both.
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
 * Duck-typed for the same reason the mapper above is, and because a rejected
 * value can be anything at all — including a string a library threw.
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
