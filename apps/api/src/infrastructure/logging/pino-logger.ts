import { pino, type DestinationStream, type Logger as Pino } from 'pino';
import type { Logger } from '../../domain/ports/logger.js';
import type { LogLevel } from '../types/config.js';

export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;

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

  info(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(context, message);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(context, message);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.logger.error(context, message);
  }

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
