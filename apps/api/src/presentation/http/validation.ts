import type { z } from 'zod';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import type { ApiGatewayRequestEvent } from '../types/api-gateway-request-event.js';
import type { HttpRequest } from '../types/http-request.js';
import type { HttpResponse } from '../types/http-response.js';
import { readRawBody } from './api-gateway-request.js';
import { errorResponse } from './http-response.js';
import { BAD_REQUEST } from './http-status.js';

const INVALID_REQUEST_CODE = 'INVALID_REQUEST';

/**
 * Long enough to name several offending fields, short enough that a body full
 * of rejected values cannot be reflected back as a multi-kilobyte response.
 */
const MAX_VALIDATION_MESSAGE_LENGTH = 500;

/**
 * The schemas come from `@vocali/contracts`, the same module the frontend
 * validates against, so the two cannot drift about what a valid request is.
 * Nothing here re-states a rule the schema already carries.
 */
export function withValidatedBody<Schema extends z.ZodTypeAny, Request extends HttpRequest>(
  schema: Schema,
  handler: (request: Request, body: z.infer<Schema>) => Promise<HttpResponse>,
): (request: Request) => Promise<HttpResponse> {
  return (request: Request): Promise<HttpResponse> => {
    const payload = readJsonBody(request.event);
    if (!payload.success) {
      return Promise.resolve(invalidRequestResponse(request.requestId, payload.error));
    }

    return validateAndRun(schema, payload.value, request, handler);
  };
}

export function withValidatedQuery<Schema extends z.ZodTypeAny, Request extends HttpRequest>(
  schema: Schema,
  handler: (request: Request, query: z.infer<Schema>) => Promise<HttpResponse>,
): (request: Request) => Promise<HttpResponse> {
  return (request: Request): Promise<HttpResponse> =>
    validateAndRun(schema, request.event.queryStringParameters ?? {}, request, handler);
}

/**
 * API Gateway fills these from the URL, so `{transcriptionId}` is whatever the
 * caller typed. Validating turns a missing or absurd segment into a 400 here
 * rather than an unbounded string travelling into a DynamoDB key.
 */
export function withValidatedPathParameters<
  Schema extends z.ZodTypeAny,
  Request extends HttpRequest,
>(
  schema: Schema,
  handler: (request: Request, parameters: z.infer<Schema>) => Promise<HttpResponse>,
): (request: Request) => Promise<HttpResponse> {
  return (request: Request): Promise<HttpResponse> =>
    validateAndRun(schema, request.event.pathParameters ?? {}, request, handler);
}

function validateAndRun<Schema extends z.ZodTypeAny, Request extends HttpRequest>(
  schema: Schema,
  source: unknown,
  request: Request,
  handler: (request: Request, value: z.infer<Schema>) => Promise<HttpResponse>,
): Promise<HttpResponse> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    return Promise.resolve(invalidRequestResponse(request.requestId, describeIssues(parsed.error)));
  }

  return handler(request, parsed.data as z.infer<Schema>);
}

/**
 * An absent body becomes an empty object rather than a parse failure, so a
 * client that forgot to send one is told which fields are missing instead of
 * being told its JSON is malformed. The second message is true and useless.
 */
function readJsonBody(event: ApiGatewayRequestEvent): Result<unknown, string> {
  const raw = readRawBody(event);
  if (raw === undefined || raw === '') return ok({});

  try {
    return ok(JSON.parse(raw));
  } catch {
    return err('Request body is not valid JSON');
  }
}

/**
 * Repeats Zod's own message per field. Where one echoes a rejected value it
 * echoes the caller's own input back to the caller — nothing from storage, a
 * provider or another user is reachable from here.
 */
function describeIssues(error: z.ZodError): string {
  const described = error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');

  return described.slice(0, MAX_VALIDATION_MESSAGE_LENGTH);
}

function invalidRequestResponse(requestId: string, message: string): HttpResponse {
  return errorResponse(BAD_REQUEST, {
    code: INVALID_REQUEST_CODE,
    message,
    requestId,
  });
}
