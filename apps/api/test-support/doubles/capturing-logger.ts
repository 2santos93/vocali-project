import type { Logger } from '../../src/domain/ports/logger.js';

export type CapturedLogLevel = 'info' | 'warn' | 'error';

export interface CapturedLogEntry {
  readonly level: CapturedLogLevel;
  readonly message: string;
  readonly context: Record<string, unknown>;
}

/**
 * The level is recorded alongside the message because it is part of the
 * behaviour: a failure written at `info` disappears the moment an operator
 * raises `LOG_LEVEL`, and nothing inspecting only the text can see that.
 */
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

  /**
   * The child writes into this logger's record rather than one of its own, as
   * pino's child does, and stamps `requestId` — the same field `PinoLogger`
   * uses. A double that dropped the id would let a handler forget to correlate
   * and still pass; one that renamed it would let a test assert a field
   * production never writes.
   */
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
