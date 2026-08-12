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
  readonly entries: CapturedLogEntry[] = [];

  info(message: string, context: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'info', message, context });
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'warn', message, context });
  }

  error(message: string, context: Record<string, unknown> = {}): void {
    this.entries.push({ level: 'error', message, context });
  }

  /** Everything written, as one string, for "this must not appear" assertions. */
  serialise(): string {
    return JSON.stringify(this.entries);
  }
}
