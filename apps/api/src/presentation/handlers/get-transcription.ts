import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import { TranscriptionPathParametersSchema } from '../http/request-schemas.js';
import { withValidatedPathParameters } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { GetTranscriptionDependencies } from '../types/dependencies.js';

/**
 * `GET /transcriptions/{transcriptionId}`.
 *
 * The id comes from the path and the owner from the token, and only one of
 * those is the caller's to choose: a path id belonging to somebody else
 * resolves to nothing, because the repository builds its partition key from
 * the authenticated user.
 */
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
