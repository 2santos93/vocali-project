import type { Logger } from '../../src/domain/ports/logger.js';

export type CapturedLogLevel = 'info' | 'warn' | 'error';

export interface CapturedLogEntry {
  readonly level: CapturedLogLevel;
  readonly message: string;
  readonly context: Record<string, unknown>;
}

/**
 * Keeps every line a subject logged, so a test can assert on what was written
 * — and, more usefully, on what was not. `SilentLogger` is the right double
 * when the log is noise; this one is for when the log is the thing under test.
 *
 * The level is recorded alongside the message because it is part of the
 * behaviour: a failure written at `info` disappears the moment an operator
 * raises `LOG_LEVEL`, and nothing that only inspects the text can see that.
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
   * The child writes into this logger's record rather than one of its own,
   * which is how pino's child behaves: one stream, with the id stamped on the
   * lines the child writes. A double that dropped the id instead would let a
   * handler forget to correlate and still pass.
   *
   * Stamped under `requestId`, the same field `PinoLogger` uses. A double that
   * named it differently would let a test assert a field production never
   * writes.
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
