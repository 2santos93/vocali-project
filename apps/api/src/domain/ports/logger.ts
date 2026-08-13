export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  /**
   * A logger stamping the id on every line it writes, so a failure reported to
   * a client with a request id can be found in the logs by that same id.
   */
  withCorrelationId(correlationId: string): Logger;
}
