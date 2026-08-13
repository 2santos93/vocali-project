import { CreateUploadIntentRequestSchema } from '@vocali/contracts';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { CREATED } from '../http/http-status.js';
import { withValidatedBody } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/api-gateway-request-handler.js';
import type { CreateUploadIntentDependencies } from '../types/create-upload-intent-dependencies.js';

/**
 * `POST /uploads` — issues a presigned upload and creates the record it will
 * belong to.
 *
 * The input is assembled field by field rather than spread from the body. The
 * schema strips unknown keys today, so naming each field is what stops a
 * `userId` in the request surviving a future schema: this is the endpoint where
 * getting that wrong hands one user's upload to another's storage prefix.
 */
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

        // Unreachable through this route today: `AudioFile`'s rules and
        // `CreateUploadIntentRequestSchema`'s are deliberately equivalent, so
        // the schema rejects first. It stays because the value object owns
        // those rules and the two could drift apart.
        return result.success
          ? jsonResponse(CREATED, result.value, request.requestId)
          : toErrorResponse(result.error, request.requestId);
      }),
    ),
  );
}
