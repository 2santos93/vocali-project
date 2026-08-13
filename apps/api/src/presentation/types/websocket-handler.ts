import type { WebSocketRequestEvent } from './websocket-request-event.js';
import type { WebSocketResponse } from './websocket-response.js';

export type WebSocketHandler = (event: WebSocketRequestEvent) => Promise<WebSocketResponse>;
