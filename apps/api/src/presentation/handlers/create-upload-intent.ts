import { CreateUploadIntentRequestSchema } from '@vocali/contracts';
import type { CreateAudioUploadIntent } from '../../application/use-cases/create-audio-upload-intent.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestHandler } from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { toErrorResponse, withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { withValidatedBody } from '../http/validation.js';

const CREATED_STATUS = 201;

interface Dependencies {
  readonly useCase: CreateAudioUploadIntent;
  readonly logger: Logger;
}

/**
 * `POST /uploads` — issues a presigned upload and creates the record it will
 * belong to.
 *
 * The input is assembled field by field rather than spread from the body. The
 * schema already strips unknown keys, so a `userId` in the request would not
 * survive it today; naming each field means it could not survive a future
 * schema either. `userId` comes from the authenticated `sub` and from nowhere
 * else, and this is the endpoint where getting that wrong hands one user's
 * upload to another user's storage prefix.
 */
export function createUploadIntentHandler(dependencies: Dependencies): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedBody(CreateUploadIntentRequestSchema, async (request, body) => {
        const result = await dependencies.useCase.execute({
          userId: request.userId,
          fileName: body.fileName,
          contentType: body.contentType,
          sizeBytes: body.sizeBytes,
          language: body.language,
        });

        // The error arm is defence in depth and not reachable through this
        // route today: `AudioFile`'s rules and `CreateUploadIntentRequestSchema`'s
        // are deliberately equivalent, so the schema rejects first. It stays
        // because the value object owns those rules — it must not depend on
        // presentation code having run — and the two could drift apart.
        return result.success
          ? jsonResponse(CREATED_STATUS, result.value, request.requestId)
          : toErrorResponse(result.error, request.requestId);
      }),
    ),
  );
}
