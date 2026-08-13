import { pino, type DestinationStream, type Logger as Pino } from 'pino';
import type { Logger } from '../../domain/ports/logger.js';
import type { LogLevel } from '../types/config.js';

/**
 * Pino's set without `fatal`. The `Logger` port emits nothing above `error`, so
 * `fatal` would be a level an operator can set that silences every line the
 * system is capable of writing. `debug` and `trace` are merely permissive.
 */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;

/**
 * A last line of defence. No call site puts a credential into a log context
 * today, but a log line is written once and retained for the life of the log
 * group. The `*.` forms catch a credential one level down, which is how a
 * request or response object usually arrives.
 */
const REDACTED_PATHS = [
  'apiKey',
  'authorization',
  'jwt',
  'key',
  'password',
  'secret',
  'token',
  '*.apiKey',
  '*.authorization',
  '*.jwt',
  '*.key',
  '*.password',
  '*.secret',
  '*.token',
];

export class PinoLogger implements Logger {
  constructor(private readonly logger: Pino) {}

  // Context first, message second throughout: that is pino's merging-object
  // signature, and the other way round stringifies the object into the message
  // and loses every field as a queryable attribute.
  info(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(context, message);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(context, message);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.logger.error(context, message);
  }

  /**
   * Stamped as `requestId`, not `correlationId`, and the mismatch with the
   * method name is deliberate: the value an operator holds arrives as
   * `x-request-id` on the response and as `requestId` in the error body. Any
   * other field name means the obvious filter returns nothing.
   */
  withCorrelationId(correlationId: string): PinoLogger {
    return new PinoLogger(this.logger.child({ requestId: correlationId }));
  }
}

export function createLogger(
  options: { level: LogLevel },
  destination?: DestinationStream,
): PinoLogger {
  const root = pino(
    {
      level: options.level,
      // Lambda already labels every line with the function and the stream, so
      // pid and hostname are noise repeated on every record.
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      // The level as a word rather than pino's numeric code, so the
      // `level = "error"` filter an operator writes from memory matches.
      formatters: { level: (label): Record<string, unknown> => ({ level: label }) },
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    },
    destination,
  );

  return new PinoLogger(root);
}
