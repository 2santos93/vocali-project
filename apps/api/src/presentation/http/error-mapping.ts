import { DOMAIN_ERROR_CODES, type DomainErrorCode } from '@vocali/contracts/constants';
import type { Logger } from '../../domain/ports/logger.js';
import type {
  ApiGatewayRequestEvent,
  ApiGatewayRequestHandler,
  HttpRequest,
  HttpResponse,
  RecognisedDomainError,
} from '../types/http.js';
import { errorResponse } from './http-response.js';
import { BAD_REQUEST, CONFLICT, INTERNAL_SERVER_ERROR, NOT_FOUND } from './http-status.js';

const INTERNAL_ERROR_CODE = 'INTERNAL_ERROR';
const INTERNAL_ERROR_MESSAGE = 'The request could not be completed';

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

export function toErrorResponse(error: unknown, requestId: string): HttpResponse {
  const domainError = recogniseDomainError(error);
  if (domainError === null) return internalErrorResponse(requestId);

  const statusCode = STATUS_BY_DOMAIN_ERROR_CODE[domainError.code];
  if (statusCode >= INTERNAL_SERVER_ERROR) return internalErrorResponse(requestId);

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

export function withErrorMapping(
  logger: Logger,
  handler: (request: HttpRequest) => Promise<HttpResponse>,
): ApiGatewayRequestHandler {
  return async (event: ApiGatewayRequestEvent): Promise<HttpResponse> => {
    const requestId = event.requestContext.requestId;
    const requestLogger = logger.withCorrelationId(requestId);

    try {
      return await handler({ event, requestId, logger: requestLogger });
    } catch (cause: unknown) {
      requestLogger.error('Request failed and was answered with a generic error', {
        ...describeThrown(cause),
      });

      return toErrorResponse(cause, requestId);
    }
  };
}

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
 * value can be anything at all, including a string a library threw.
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
