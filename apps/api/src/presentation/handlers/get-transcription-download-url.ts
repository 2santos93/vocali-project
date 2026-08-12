import type { GetTranscriptionDownloadUrl } from '../../application/use-cases/get-transcription-download-url.js';
import type { Logger } from '../../domain/ports/logger.js';
import type {
  ApiGatewayRequestHandler,
  AuthenticatedHttpRequest,
} from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse, type HttpResponse } from '../http/http-response.js';
import {
  DownloadUrlQuerySchema,
  TranscriptionPathParametersSchema,
} from '../http/request-schemas.js';
import { withValidatedPathParameters, withValidatedQuery } from '../http/validation.js';

const OK_STATUS = 200;

interface Dependencies {
  readonly useCase: GetTranscriptionDownloadUrl;
  readonly logger: Logger;
}

/**
 * `GET /transcriptions/{transcriptionId}/download?format=txt|json` — a
 * short-lived signed link to the transcript.
 *
 * The only endpoint that validates two sources, so the query middleware is
 * applied inside the path one and closes over the id it produced. A record
 * that is not `COMPLETED` yet is answered 409 rather than 404: the client
 * asked for something that exists and is not ready, and "not found" would
 * send it looking for a bug instead of waiting.
 */
export function getTranscriptionDownloadUrlHandler(
  dependencies: Dependencies,
): ApiGatewayRequestHandler {
  const respondForTranscription = (
    transcriptionId: string,
  ): ((request: AuthenticatedHttpRequest) => Promise<HttpResponse>) =>
    withValidatedQuery(DownloadUrlQuerySchema, async (request, query) => {
      const result = await dependencies.useCase.execute({
        userId: request.userId,
        transcriptionId,
        format: query.format,
      });

      return result.success
        ? jsonResponse(OK_STATUS, result.value, request.requestId)
        : toErrorResponse(result.error, request.requestId);
    });

  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedPathParameters(TranscriptionPathParametersSchema, (request, parameters) =>
        respondForTranscription(parameters.transcriptionId)(request),
      ),
    ),
  );
}
