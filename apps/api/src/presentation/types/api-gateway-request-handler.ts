import type { ApiGatewayRequestEvent } from './api-gateway-request-event.js';
import type { HttpResponse } from './http-response.js';

export type ApiGatewayRequestHandler = (event: ApiGatewayRequestEvent) => Promise<HttpResponse>;
