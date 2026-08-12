import { pino, type DestinationStream, type Logger as Pino } from 'pino';
import type { Logger } from '../../domain/ports/logger.js';

/**
 * Pino's set without `fatal`. The `Logger` port emits nothing above `error`,
 * so `fatal` is a level an operator can set, the environment schema accepts,
 * and which silences every line the system is capable of writing — the same
 * defect that having only `info` on the port used to produce. `debug` and
 * `trace` stay: they are merely permissive, and a level below `info` costs
 * nothing because nothing writes there either.
 */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * A last line of defence, not the first. No call site puts a credential into a
 * log context today and the provider adapter has a test proving it, but a log
 * line is written once and retained for as long as the log group lives. The
 * `*.` forms catch a credential one level down, which is how a request or a
 * response object usually arrives.
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
 * read in a terminal and unqueryable in the only place these lines are read.
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
   * Stamped as `requestId`, not as `correlationId`, and the mismatch with the
   * method name is deliberate. The port's vocabulary is generic because
   * correlation is the concept; the field name is not free, because the value
   * an operator holds arrives as `x-request-id` on the response or as
   * `requestId` in an error body. A field called anything else means the
   * obvious filter returns nothing and the operator concludes there are no
   * logs — the mechanism working and the person unable to reach it.
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
