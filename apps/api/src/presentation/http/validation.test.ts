import {
  CreateUploadIntentRequestSchema,
  ListTranscriptionsQuerySchema,
  SaveRealtimeTranscriptionRequestSchema,
} from '@vocali/contracts';
import { z } from 'zod';
import {
  withValidatedBody,
  withValidatedPathParameters,
  withValidatedQuery,
} from './validation.js';
import { jsonResponse, type HttpResponse } from './http-response.js';
import type { HttpRequest } from './api-gateway-request.js';
import {
  buildApiGatewayEvent,
  parseResponseBody,
} from '../../../test/builders/api-gateway-event.builder.js';

function toRequest(event: ReturnType<typeof buildApiGatewayEvent>): HttpRequest {
  return { event, requestId: event.requestContext.requestId };
}

/** Echoes whatever the middleware handed over, so a test can assert on it. */
function echo(_request: HttpRequest, value: unknown): Promise<HttpResponse> {
  return Promise.resolve(jsonResponse(200, { received: value }, 'request-1'));
}

const VALID_UPLOAD_BODY = {
  fileName: 'informe radiologia.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 1_024,
  language: 'es',
};

describe('withValidatedBody', () => {
  it('hands the parsed body to the handler', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);

    const response = await wrapped(
      toRequest(buildApiGatewayEvent({ body: JSON.stringify(VALID_UPLOAD_BODY) })),
    );

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response.body).received).toEqual(VALID_UPLOAD_BODY);
  });

  it('applies the schema default rather than leaving the field absent', async () => {
    const wrapped = withValidatedBody(SaveRealtimeTranscriptionRequestSchema, echo);
    const body = JSON.stringify({ text: 'el paciente refiere dolor', durationSeconds: 12 });

    const response = await wrapped(toRequest(buildApiGatewayEvent({ body })));

    expect(parseResponseBody(response.body).received).toEqual({
      text: 'el paciente refiere dolor',
      durationSeconds: 12,
      language: 'es',
    });
  });

  it('answers 400 naming the offending field', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);
    const body = JSON.stringify({ ...VALID_UPLOAD_BODY, contentType: 'application/zip' });

    const response = await wrapped(toRequest(buildApiGatewayEvent({ body })));

    expect(response.statusCode).toBe(400);
    const parsed = parseResponseBody(response.body);
    expect(parsed.code).toBe('INVALID_REQUEST');
    expect(parsed.message).toContain('contentType');
  });

  it('answers 400 for a body that is not JSON', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);

    const response = await wrapped(toRequest(buildApiGatewayEvent({ body: 'not json at all' })));

    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response.body).message).toBe('Request body is not valid JSON');
  });

  it('reports the missing fields, not a parse failure, when the body is absent', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);

    const response = await wrapped(toRequest(buildApiGatewayEvent()));

    expect(response.statusCode).toBe(400);
    const message = String(parseResponseBody(response.body).message);
    expect(message).toContain('fileName');
    expect(message).not.toContain('not valid JSON');
  });

  it('answers 400 for a body that is valid JSON but not an object', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);

    const response = await wrapped(toRequest(buildApiGatewayEvent({ body: '"just a string"' })));

    expect(response.statusCode).toBe(400);
    // A whole-body rejection carries no field path, so the message is Zod's
    // own sentence rather than an empty prefix followed by a colon.
    const message = String(parseResponseBody(response.body).message);
    expect(message).toContain('Expected object');
    expect(message.startsWith(':')).toBe(false);
  });

  it('decodes a base64-encoded body before parsing it', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);
    const event = buildApiGatewayEvent({
      body: Buffer.from(JSON.stringify(VALID_UPLOAD_BODY), 'utf8').toString('base64'),
      isBase64Encoded: true,
    });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response.body).received).toEqual(VALID_UPLOAD_BODY);
  });

  it('caps the length of a validation message so a hostile body cannot be reflected in bulk', async () => {
    const schema = z.object({ value: z.string().max(1) });
    const wrapped = withValidatedBody(schema, echo);
    const body = JSON.stringify({ value: 'x'.repeat(20_000), ...Object.fromEntries([]) });

    const response = await wrapped(toRequest(buildApiGatewayEvent({ body })));

    expect(response.statusCode).toBe(400);
    expect(String(parseResponseBody(response.body).message).length).toBeLessThanOrEqual(500);
  });

  it('rejects a file name carrying a control character, through the shared contract', async () => {
    const wrapped = withValidatedBody(CreateUploadIntentRequestSchema, echo);
    const body = JSON.stringify({ ...VALID_UPLOAD_BODY, fileName: 'informe\r\nX-Injected: 1.mp3' });

    const response = await wrapped(toRequest(buildApiGatewayEvent({ body })));

    expect(response.statusCode).toBe(400);
    expect(String(parseResponseBody(response.body).message)).toContain('fileName');
  });
});

describe('withValidatedQuery', () => {
  it('hands the parsed query to the handler', async () => {
    const wrapped = withValidatedQuery(ListTranscriptionsQuerySchema, echo);
    const event = buildApiGatewayEvent({ queryStringParameters: { cursor: 'abc' } });

    const response = await wrapped(toRequest(event));

    expect(parseResponseBody(response.body).received).toEqual({ cursor: 'abc' });
  });

  it('treats an absent query string as an empty object', async () => {
    const wrapped = withValidatedQuery(ListTranscriptionsQuerySchema, echo);

    const response = await wrapped(toRequest(buildApiGatewayEvent()));

    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response.body).received).toEqual({});
  });

  it('answers 400 for a cursor beyond the length the contract allows', async () => {
    const wrapped = withValidatedQuery(ListTranscriptionsQuerySchema, echo);
    const event = buildApiGatewayEvent({ queryStringParameters: { cursor: 'x'.repeat(513) } });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(400);
    expect(String(parseResponseBody(response.body).message)).toContain('cursor');
  });
});

describe('withValidatedPathParameters', () => {
  const schema = z.object({ transcriptionId: z.string().min(1).max(64) });

  it('hands the parsed path parameters to the handler', async () => {
    const wrapped = withValidatedPathParameters(schema, echo);
    const event = buildApiGatewayEvent({ pathParameters: { transcriptionId: '01A' } });

    const response = await wrapped(toRequest(event));

    expect(parseResponseBody(response.body).received).toEqual({ transcriptionId: '01A' });
  });

  it('answers 400 when the parameter is missing', async () => {
    const wrapped = withValidatedPathParameters(schema, echo);

    const response = await wrapped(toRequest(buildApiGatewayEvent()));

    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response.body).code).toBe('INVALID_REQUEST');
  });

  it('answers 400 for an unbounded identifier rather than passing it to storage', async () => {
    const wrapped = withValidatedPathParameters(schema, echo);
    const event = buildApiGatewayEvent({ pathParameters: { transcriptionId: 'x'.repeat(65) } });

    const response = await wrapped(toRequest(event));

    expect(response.statusCode).toBe(400);
  });
});
