import type { HttpRequest } from './http-request.js';

/**
 * Exists so "authenticated" is something a handler receives rather than
 * something it remembers to check: `withAuthenticatedUser` is the only thing
 * in this layer that constructs the shape.
 */
export interface AuthenticatedHttpRequest extends HttpRequest {
  readonly userId: string;
}
