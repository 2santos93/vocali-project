import type { DestinationStream } from 'pino';
import { createLogger } from '../pino-logger.js';
import type { LogLevel } from '../../types/log-level.js';

interface CapturedStream extends DestinationStream {
  readonly lines: Record<string, unknown>[];
}

function captureStream(): CapturedStream {
  const lines: Record<string, unknown>[] = [];

  return {
    lines,
    write(chunk: string): void {
      lines.push(JSON.parse(chunk) as Record<string, unknown>);
    },
  };
}

function buildLogger(level: LogLevel = 'info'): {
  logger: ReturnType<typeof createLogger>;
  stream: CapturedStream;
} {
  const stream = captureStream();

  return { logger: createLogger({ level }, stream), stream };
}

describe('PinoLogger', () => {
  it('writes one structured record per call, with the context as queryable fields', () => {
    const { logger, stream } = buildLogger();

    logger.info('Started a transcription job', { transcriptionId: '01A', attempt: 2 });

    expect(stream.lines).toHaveLength(1);
    expect(stream.lines[0]).toEqual({
      level: 'info',
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      msg: 'Started a transcription job',
      // Flat fields, not a string. `msg` alone would still be readable and
      // would make `transcriptionId = "01A"` unqueryable in Logs Insights,
      // which is the only place these lines are ever actually read.
      transcriptionId: '01A',
      attempt: 2,
    });
  });

  it('omits pid and hostname, which Lambda already records', () => {
    const { logger, stream } = buildLogger();

    logger.info('Started a transcription job');

    expect(stream.lines[0]).not.toHaveProperty('pid');
    expect(stream.lines[0]).not.toHaveProperty('hostname');
  });

  it('stamps the correlation id on every line a request writes', () => {
    const { logger, stream } = buildLogger();
    const requestLogger = logger.withCorrelationId('req-7');

    requestLogger.info('Received the upload intent');
    requestLogger.info('Presigned the upload');
    logger.info('Something unrelated to the request');

    // The client is handed this same id with any error, so the line it points
    // at has to be findable.
    expect(stream.lines.map((line) => line.requestId)).toEqual(['req-7', 'req-7', undefined]);
  });

  it('redacts a credential that reaches a log context', () => {
    const { logger, stream } = buildLogger();

    logger.info('Calling the provider', {
      apiKey: 'JnT4pKq7XwZ2bR9mLd6VsYh1Gc3FaE8u',
      headers: { authorization: 'Bearer JnT4pKq7XwZ2bR9mLd6VsYh1Gc3FaE8u' },
      transcriptionId: '01A',
    });

    const written = JSON.stringify(stream.lines);
    expect(written).not.toContain('JnT4pKq7XwZ2bR9mLd6VsYh1Gc3FaE8u');
    expect(stream.lines[0]).toMatchObject({
      apiKey: '[redacted]',
      headers: { authorization: '[redacted]' },
      transcriptionId: '01A',
    });
  });

  it('drops routine progress at a raised level and keeps the failures', () => {
    const { logger, stream } = buildLogger('warn');

    logger.info('Routine progress nobody needs in production');
    logger.warn('Transcription provider request failed and will be retried');
    logger.error('Transcription provider request exhausted its attempts');

    // LOG_LEVEL=warn is what an operator reaches for to cut noise. If the port
    // only declared `info`, that one setting would silence the whole system.
    expect(stream.lines.map((line) => [line.level, line.msg])).toEqual([
      ['warn', 'Transcription provider request failed and will be retried'],
      ['error', 'Transcription provider request exhausted its attempts'],
    ]);
  });
});
