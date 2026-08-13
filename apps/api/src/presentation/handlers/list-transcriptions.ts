import { ListTranscriptionsQuerySchema } from '@vocali/contracts';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import { withValidatedQuery } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/api-gateway-request-handler.js';
import type { ListTranscriptionsDependencies } from '../types/list-transcriptions-dependencies.js';

/**
 * `GET /transcriptions` — the signed-in user's history, newest first.
 *
 * A cursor minted for a different user is rejected by the repository as
 * `INVALID_CURSOR`: the check lives there because that is where the cursor is
 * decoded and can be compared against the partition it would be applied to.
 */
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
