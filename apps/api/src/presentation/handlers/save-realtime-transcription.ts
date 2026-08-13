import { SaveRealtimeTranscriptionRequestSchema } from '@vocali/contracts';
import { withAuthenticatedUser } from '../http/authentication.js';
import { withErrorMapping } from '../http/error-mapping.js';
import { jsonResponse } from '../http/http-response.js';
import { CREATED } from '../http/http-status.js';
import { withValidatedBody } from '../http/validation.js';
import type { ApiGatewayRequestHandler } from '../types/http.js';
import type { SaveRealtimeTranscriptionDependencies } from '../types/dependencies.js';

/**
 * `POST /transcriptions/realtime` — stores a finished microphone dictation.
 *
 * The use case returns a DTO rather than a `Result`: the transcript arrives
 * complete, so no domain rule is left to reject it and anything that goes
 * wrong is infrastructure the error mapper answers with a 500.
 */
export function saveRealtimeTranscriptionHandler(
  dependencies: SaveRealtimeTranscriptionDependencies,
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
          clientSessionId: body.clientSessionId,
        });

        return jsonResponse(CREATED, transcription, request.requestId);
      }),
    ),
  );
}
