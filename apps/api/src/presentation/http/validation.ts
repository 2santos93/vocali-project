import type { z } from 'zod';
import { err, ok } from '../../domain/shared/result.js';
import type { Result } from '../../domain/types/result.js';
import type { ApiGatewayRequestEvent, HttpRequest, HttpResponse } from '../types/http.js';
import { readRawBody } from './api-gateway-request.js';
import { errorResponse } from './http-response.js';
import { BAD_REQUEST } from './http-status.js';

const INVALID_REQUEST_CODE = 'INVALID_REQUEST';

/**
 * Long enough to name several offending fields, short enough that a body full
 * of rejected values cannot be reflected back as a multi-kilobyte response.
 */
const MAX_VALIDATION_MESSAGE_LENGTH = 500;

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

function readJsonBody(event: ApiGatewayRequestEvent): Result<unknown, string> {
  const raw = readRawBody(event);
  if (raw === undefined || raw === '') return ok({});

  try {
    return ok(JSON.parse(raw));
  } catch {
    return err('Request body is not valid JSON');
  }
}

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
