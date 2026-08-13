import type { LOG_LEVELS } from '../logging/pino-logger.js';

export type LogLevel = (typeof LOG_LEVELS)[number];
