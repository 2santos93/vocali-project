import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import { TranscriptionPathParametersSchema } from '../http/request-schemas.js';
import { withValidatedPathParameters } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { GetTranscriptionDependencies } from '../types/dependencies.js';

// GET /transcriptions/{transcriptionId}
export function getTranscriptionHandler(
  dependencies: GetTranscriptionDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedPathParameters(
        TranscriptionPathParametersSchema,
        async (request, parameters) => {
          const result = await dependencies.useCase.execute({
            userId: request.userId,
            transcriptionId: parameters.transcriptionId,
          });

          return result.success
            ? jsonResponse(OK, result.value, request.requestId)
            : toErrorResponse(result.error, request.requestId);
        },
      ),
    ),
  );
}
