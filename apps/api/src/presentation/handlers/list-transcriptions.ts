import { ListTranscriptionsQuerySchema } from '@vocali/contracts';
import type { ListUserTranscriptions } from '../../application/use-cases/list-user-transcriptions.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestHandler } from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { withValidatedQuery } from '../http/validation.js';

const OK_STATUS = 200;

interface Dependencies {
  readonly useCase: ListUserTranscriptions;
  readonly logger: Logger;
}

/**
 * `GET /transcriptions` — the signed-in user's history, newest first.
 *
 * The cursor is optional and opaque. A cursor minted for a different user is
 * rejected by the repository as `INVALID_CURSOR`, which the mapper answers
 * 400 — the check lives there because that is where the cursor is decoded and
 * where it can be compared against the partition it would be applied to.
 */
export function listTranscriptionsHandler(dependencies: Dependencies): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedQuery(ListTranscriptionsQuerySchema, async (request, query) => {
        const result = await dependencies.useCase.execute({
          userId: request.userId,
          cursor: query.cursor ?? null,
        });

        return result.success
          ? jsonResponse(OK_STATUS, result.value, request.requestId)
          : toErrorResponse(result.error, request.requestId);
      }),
    ),
  );
}
