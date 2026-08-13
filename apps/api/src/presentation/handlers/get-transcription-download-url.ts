import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import {
  DownloadUrlQuerySchema,
  TranscriptionPathParametersSchema,
} from '../http/request-schemas.js';
import { withValidatedPathParameters, withValidatedQuery } from '../http/validation.js';
import type {
  ApiGatewayRequestHandler,
  AuthenticatedHttpRequest,
  HttpResponse,
} from '../types/http.js';
import type { GetTranscriptionDownloadUrlDependencies } from '../types/dependencies.js';

// GET /transcriptions/{transcriptionId}/download
export function getTranscriptionDownloadUrlHandler(
  dependencies: GetTranscriptionDownloadUrlDependencies,
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
        ? jsonResponse(OK, result.value, request.requestId)
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
