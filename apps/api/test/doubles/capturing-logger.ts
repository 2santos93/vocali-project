import type { Logger } from '../../src/domain/ports/logger.js';

export interface CapturedLogEntry {
  readonly message: string;
  readonly context: Record<string, unknown>;
}

/**
 * Keeps every line a subject logged, so a test can assert on what was written
 * — and, more usefully, on what was not. `SilentLogger` is the right double
 * when the log is noise; this one is for when the log is the thing under test.
 */
export class CapturingLogger implements Logger {
  readonly entries: CapturedLogEntry[] = [];

  info(message: string, context: Record<string, unknown> = {}): void {
    this.entries.push({ message, context });
  }

  /** Everything written, as one string, for "this must not appear" assertions. */
  serialise(): string {
    return JSON.stringify(this.entries);
  }
}
