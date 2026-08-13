import type { GetTranscription } from '../../application/use-cases/get-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestHandler } from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { OK } from '../http/http-status.js';
import { TranscriptionPathParametersSchema } from '../http/request-schemas.js';
import { withValidatedPathParameters } from '../http/validation.js';

interface Dependencies {
  readonly useCase: GetTranscription;
  readonly logger: Logger;
}

/**
 * `GET /transcriptions/{transcriptionId}` — one record, for the client
 * polling an upload it has just made.
 *
 * The id comes from the path and the owner comes from the token. Both are
 * needed to address the record, and only one of them is the caller's to
 * choose: a path id belonging to somebody else resolves to nothing, because
 * the repository builds its partition key from the authenticated user.
 */
export function getTranscriptionHandler(dependencies: Dependencies): ApiGatewayRequestHandler {
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
