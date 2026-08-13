import { InvalidCursorError } from '../../domain/errors/domain-error.js';
import { err, ok, type Result } from '../../domain/shared/result.js';

/**
 * The opaque token a history page hands back, and the reading of one that
 * comes in.
 *
 * Held apart from the repository because it is a contract with two audiences
 * rather than a detail of the table. Outwards it is what a client sends back
 * unmodified — which makes it attacker-controlled input, and the reason every
 * field is checked instead of parsed and trusted. Sideways it has to agree
 * byte for byte with what the in-memory double emits, so that a use-case test
 * passing against the double means the same thing against DynamoDB.
 *
 * The double keeps its own implementation on purpose. Two implementations that
 * agree is evidence; one shared implementation is only a definition.
 */
export interface CursorPayload {
  readonly userId: string;
  readonly id: string;
}

/**
 * The base64url of `{userId, id}`. The raw DynamoDB key never leaves the
 * adapter: the client is handed an opaque token bound to a user, not a storage
 * address it could edit.
 */
export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): Result<CursorPayload, InvalidCursorError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return err(new InvalidCursorError('cursor is not valid base64url-encoded JSON'));
  }

  if (!isCursorPayload(parsed)) {
    return err(new InvalidCursorError('cursor payload is missing userId or id'));
  }

  return ok(parsed);
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return typeof record.userId === 'string' && typeof record.id === 'string';
}
