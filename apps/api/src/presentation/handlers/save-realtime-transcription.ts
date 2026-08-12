import { SaveRealtimeTranscriptionRequestSchema } from '@vocali/contracts';
import type { SaveRealtimeTranscription } from '../../application/use-cases/save-realtime-transcription.js';
import type { Logger } from '../../domain/ports/logger.js';
import type { ApiGatewayRequestHandler } from '../http/api-gateway-request.js';
import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { withValidatedBody } from '../http/validation.js';

const CREATED_STATUS = 201;

interface Dependencies {
  readonly useCase: SaveRealtimeTranscription;
  readonly logger: Logger;
}

/**
 * `POST /transcriptions/realtime` — stores a finished microphone dictation.
 *
 * The use case returns a DTO rather than a `Result`: the transcript was
 * produced client-side during the session and arrives complete, so there is
 * no domain rule left to reject it. Anything that goes wrong from here is
 * storage or the table failing, which the error mapper answers with a 500.
 */
export function saveRealtimeTranscriptionHandler(
  dependencies: Dependencies,
): ApiGatewayRequestHandler {
  return withErrorMapping(
    dependencies.logger,
    withAuthenticatedUser(
      withValidatedBody(SaveRealtimeTranscriptionRequestSchema, async (request, body) => {
        const transcription = await dependencies.useCase.execute({
          userId: request.userId,
          text: body.text,
          durationSeconds: body.durationSeconds,
          language: body.language,
        });

        return jsonResponse(CREATED_STATUS, transcription, request.requestId);
      }),
    ),
  );
}
