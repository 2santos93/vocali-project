import type { Logger } from '../../src/domain/ports/logger.js';

export class SilentLogger implements Logger {
  info(): void {}
  warn(): void {}
  error(): void {}

  withCorrelationId(): Logger {
    return this;
  }
}
