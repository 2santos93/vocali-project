import { toErrorResponse, withErrorMapping } from '../error-mapping.js';
import {
  AudioFileTooLargeError,
  InvalidAudioFileNameError,
  InvalidAudioFileSizeError,
  InvalidCursorError,
  InvalidStatusTransitionError,
  TranscriptionNotFoundError,
  TranscriptionNotReadyError,
  TranscriptionProviderError,
  UnsupportedAudioFormatError,
} from '../../../domain/errors/domain-error.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
  TEST_REQUEST_ID,
} from '../../../../test-support/builders/api-gateway-event.builder.js';
import { CapturingLogger } from '../../../../test-support/doubles/capturing-logger.js';
import { jsonResponse } from '../http-response.js';

const REQUEST_ID = 'request-abc';

describe('toErrorResponse', () => {
  it.each([
    ['TRANSCRIPTION_NOT_FOUND', new TranscriptionNotFoundError('01A'), 404],
    ['INVALID_CURSOR', new InvalidCursorError('cursor is not valid'), 400],
    ['UNSUPPORTED_AUDIO_FORMAT', new UnsupportedAudioFormatError('application/zip'), 400],
    ['INVALID_AUDIO_FILE_SIZE', new InvalidAudioFileSizeError(0), 400],
    ['AUDIO_FILE_TOO_LARGE', new AudioFileTooLargeError(30_000_000, 20_971_520), 400],
    ['INVALID_AUDIO_FILE_NAME', new InvalidAudioFileNameError('it contains a separator'), 400],
    ['TRANSCRIPTION_NOT_READY', new TranscriptionNotReadyError('PROCESSING'), 409],
  ])('maps %s to %i and forwards its message', (code, error, statusCode) => {
    const response = toErrorResponse(error, REQUEST_ID);

    expect(response.statusCode).toBe(statusCode);
    const body = parseResponseBody(response.body);
    expect(body.code).toBe(code);
    expect(body.message).toBe(error.message);
    expect(body.requestId).toBe(REQUEST_ID);
  });

  it('answers an unrecognised error with a 500 carrying no internal detail', () => {
    const error = new Error(
      'DynamoDB ProvisionedThroughputExceeded on table vocali-transcriptions',
    );

    const response = toErrorResponse(error, REQUEST_ID);

    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response.body);
    expect(body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed',
      requestId: REQUEST_ID,
    });
    expect(response.body).not.toContain('DynamoDB');
    expect(response.body).not.toContain('vocali-transcriptions');
    expect(JSON.stringify(response)).not.toContain('at Object');
  });

  it('answers an error carrying a stack with a 500 that does not include it', () => {
    const error = new Error('internal detail');
    error.stack = 'Error: internal detail\n    at /var/task/index.js:1:1';

    const response = toErrorResponse(error, REQUEST_ID);

    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response)).not.toContain('/var/task/index.js');
    expect(JSON.stringify(response)).not.toContain('internal detail');
  });

  it('answers a domain-shaped error whose code is not a known domain code with a 500', () => {
    const error = Object.assign(new Error('Stored transcription record is malformed: language'), {
      code: 'MALFORMED_PERSISTED_RECORD',
    });

    const response = toErrorResponse(error, REQUEST_ID);

    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response.body).code).toBe('INTERNAL_ERROR');
    expect(response.body).not.toContain('MALFORMED_PERSISTED_RECORD');
    expect(response.body).not.toContain('language');
  });

  it.each([
    ['INVALID_STATUS_TRANSITION', new InvalidStatusTransitionError('COMPLETED', 'PROCESSING')],
    ['TRANSCRIPTION_PROVIDER_FAILED', new TranscriptionProviderError('the provider rejected it')],
  ])('answers %s with a generic 500 rather than forwarding its message', (_code, error) => {
    const response = toErrorResponse(error, REQUEST_ID);

    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response.body).message).toBe('The request could not be completed');
    expect(response.body).not.toContain(error.message);
  });

  it('recognises a domain error by its code alone, with no class and no name', () => {
    const minified = { code: 'TRANSCRIPTION_NOT_FOUND', message: 'Transcription "01A" not found' };

    const response = toErrorResponse(minified, REQUEST_ID);

    expect(response.statusCode).toBe(404);
    expect(parseResponseBody(response.body).code).toBe('TRANSCRIPTION_NOT_FOUND');
  });

  it('ignores a familiar-looking name when the code is not a domain code', () => {
    // A mapper that branched on `name` would answer 404 here and hand a
    // caller-controlled shape the ability to choose its own status.
    const impostor = Object.assign(new Error('not really'), { code: 'SOMETHING_ELSE' });
    impostor.name = 'TranscriptionNotFoundError';

    expect(toErrorResponse(impostor, REQUEST_ID).statusCode).toBe(500);
  });

  it.each([[null], [undefined], ['a thrown string'], [42]])(
    'answers a thrown non-object (%p) with a 500',
    (thrown) => {
      expect(toErrorResponse(thrown, REQUEST_ID).statusCode).toBe(500);
    },
  );
});

describe('withErrorMapping', () => {
  it('passes the request id from the event through to the handler and the response', async () => {
    const logger = new CapturingLogger();
    const handler = withErrorMapping(logger, (request) =>
      Promise.resolve(jsonResponse(200, { seen: request.requestId }, request.requestId)),
    );

    const response = await handler(buildApiGatewayEvent({ requestId: 'request-xyz' }));

    expect(parseResponseBody(response.body).seen).toBe('request-xyz');
    expect(response.headers['x-request-id']).toBe('request-xyz');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('catches a thrown error, answers 500 and records the detail under the same request id', async () => {
    const logger = new CapturingLogger();
    const handler = withErrorMapping(logger, () => {
      throw new Error('bucket vocali-audio is not accessible');
    });

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('vocali-audio');
    // The detail is not lost, only moved: the client gets an id and the log
    // gets the reason, which is the only thing that makes a generic 500
    // diagnosable.
    expect(logger.serialise()).toContain('vocali-audio');
    expect(logger.entries[0]?.context.requestId).toBe(TEST_REQUEST_ID);
  });

  it('survives a handler that threw something other than an error object', async () => {
    const logger = new CapturingLogger();
    const bareString = 'a bare string from a library' as unknown as Error;
    const handler = withErrorMapping(logger, () => Promise.reject(bareString));

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(500);
    expect(logger.entries[0]?.context.errorMessage).toBe('a non-object value was thrown');
  });

  it('catches a rejected promise as well as a synchronous throw', async () => {
    const logger = new CapturingLogger();
    const handler = withErrorMapping(logger, () =>
      Promise.reject(new TranscriptionNotFoundError('01A')),
    );

    const response = await handler(buildApiGatewayEvent());

    expect(response.statusCode).toBe(404);
  });

  it('reports the same correlation id in the error header and the error body', async () => {
    const logger = new CapturingLogger();
    const handler = withErrorMapping(logger, () =>
      Promise.reject(new InvalidCursorError('unreadable')),
    );

    const response = await handler(buildApiGatewayEvent({ requestId: 'request-9' }));

    expect(response.headers['x-request-id']).toBe('request-9');
    expect(parseResponseBody(response.body).requestId).toBe('request-9');
  });
});
