import { pino, type DestinationStream, type Logger as Pino } from 'pino';
import type { Logger } from '../../domain/ports/logger.js';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * A last line of defence, not the first. Nothing in this codebase puts a
 * credential into a log context, and the provider adapter has its own test
 * proving it — but that test only covers the call sites that exist today, and
 * a log line is written once and retained for as long as the log group lives.
 * These paths cost nothing and make the accidental version of that mistake
 * unwritable rather than merely unwritten.
 *
 * The bare names catch a context object logged directly; the `*.` forms catch
 * one nested a single level down, which is how a request or a response object
 * usually arrives.
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

/**
 * Structured JSON on stdout, which is what CloudWatch Logs ingests and what
 * Logs Insights can query by field. A human-formatted line would be easier to
 * read in a terminal and unqueryable in the only place these lines are ever
 * actually read.
 */
export class PinoLogger implements Logger {
  constructor(private readonly logger: Pino) {}

  // Context first, message second throughout: that is pino's merging-object
  // signature, and passing them the other way round stringifies the object
  // into the message and loses every field as a queryable attribute.
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
   * A child logger stamping the correlation id on every line it writes.
   *
   * The handler builds one per request, so a failure reported to the client
   * with a `requestId` can be found in the logs by that same id. Threading the
   * id through the `Logger` port instead would put an HTTP concern into a
   * signature the domain owns.
   */
  withCorrelationId(correlationId: string): PinoLogger {
    return new PinoLogger(this.logger.child({ correlationId }));
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
      // The level as a word rather than pino's numeric code, so that the
      // `level = "error"` filter an operator writes from memory matches the
      // lines the `Logger` port emits: `info`, `warn` and `error`.
      formatters: { level: (label): Record<string, unknown> => ({ level: label }) },
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    },
    destination,
  );

  return new PinoLogger(root);
}
