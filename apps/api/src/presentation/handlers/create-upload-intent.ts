import { CreateUploadIntentRequestSchema } from '@vocali/contracts';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { CREATED } from '../http/http-status.js';
import { withValidatedBody } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { CreateUploadIntentDependencies } from '../types/dependencies.js';

// POST /uploads
export function createUploadIntentHandler(
  dependencies: CreateUploadIntentDependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedBody(CreateUploadIntentRequestSchema, async (request, body) => {
        const result = await dependencies.useCase.execute({
          userId: request.userId,
          fileName: body.fileName,
          contentType: body.contentType,
          sizeBytes: body.sizeBytes,
        });

        return result.success
          ? jsonResponse(CREATED, result.value, request.requestId)
          : toErrorResponse(result.error, request.requestId);
      }),
    ),
  );
}
