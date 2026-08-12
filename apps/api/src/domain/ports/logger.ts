/**
 * Three levels, because a level nothing emits is worse than no level at all:
 * an operator who sets `LOG_LEVEL=warn` to cut noise would otherwise silence
 * the whole system, including the only two lines that record that a clinical
 * transcription failed.
 */
export interface Logger {
  /** Routine progress, dropped first when an operator turns the level up. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Something went wrong and is being handled, such as a retried request. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Work that will not now complete, and that someone has to be able to find. */
  error(message: string, context?: Record<string, unknown>): void;
}
