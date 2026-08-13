import { ListTranscriptionsQuerySchema } from '@vocali/contracts';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import { withValidatedQuery } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { ListTranscriptionsDependencies } from '../types/dependencies.js';

// GET /transcriptions
export function listTranscriptionsHandler(
  dependencies: ListTranscriptionsDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedQuery(ListTranscriptionsQuerySchema, async (request, query) => {
        const result = await dependencies.useCase.execute({
          userId: request.userId,
          cursor: query.cursor ?? null,
        });

        return result.success
          ? jsonResponse(OK, result.value, request.requestId)
          : toErrorResponse(result.error, request.requestId);
      }),
    ),
  );
}
