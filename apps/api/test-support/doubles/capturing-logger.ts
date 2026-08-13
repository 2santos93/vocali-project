import type { Logger } from '../../src/domain/ports/logger.js';

export type CapturedLogLevel = 'info' | 'warn' | 'error';

export interface CapturedLogEntry {
  readonly level: CapturedLogLevel;
  readonly message: string;
  readonly context: Record<string, unknown>;
}

export class CapturingLogger implements Logger {
  readonly entries: CapturedLogEntry[];

  constructor(
    private readonly correlationId: string | null = null,
    entries: CapturedLogEntry[] = [],
  ) {
    this.entries = entries;
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    this.write('info', message, context);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.write('warn', message, context);
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.write('error', message, context);
  }

  withCorrelationId(correlationId: string): CapturingLogger {
    return new CapturingLogger(correlationId, this.entries);
  }

  /** Everything written, as one string, for "this must not appear" assertions. */
  serialise(): string {
    return JSON.stringify(this.entries);
  }

  private write(level: CapturedLogLevel, message: string, context: Record<string, unknown>): void {
    this.entries.push({
      level,
      message,
      context:
        this.correlationId === null ? context : { ...context, requestId: this.correlationId },
    });
  }
}
