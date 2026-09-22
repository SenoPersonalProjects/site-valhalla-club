import { REDACTED_LOG_VALUE } from './sanitize-log-data';
import { StructuredLoggerService } from './structured-logger.service';

describe('StructuredLoggerService', () => {
  const now = new Date('2026-09-22T15:30:00.000Z');
  let logger: StructuredLoggerService;
  let stdoutWrite: jest.SpyInstance;
  let stderrWrite: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    stdoutWrite = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrWrite = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    logger = new StructuredLoggerService();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('writes a sanitized JSON entry to stdout for info logs', () => {
    logger.info('request_received', {
      requestId: 'request-123',
      method: 'POST',
      authorization: 'Bearer secret-token',
    });

    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite).not.toHaveBeenCalled();
    expect(readEntry(stdoutWrite)).toEqual({
      requestId: 'request-123',
      method: 'POST',
      authorization: REDACTED_LOG_VALUE,
      timestamp: now.toISOString(),
      level: 'info',
      event: 'request_received',
    });
  });

  it.each(['warn', 'error'] as const)(
    'writes sanitized %s entries to stderr',
    (level) => {
      logger[level]('request_failed', {
        requestId: 'request-123',
        cookie: 'session=secret',
      });

      expect(stderrWrite).toHaveBeenCalledTimes(1);
      expect(stdoutWrite).not.toHaveBeenCalled();
      expect(readEntry(stderrWrite)).toEqual({
        requestId: 'request-123',
        cookie: REDACTED_LOG_VALUE,
        timestamp: now.toISOString(),
        level,
        event: 'request_failed',
      });
    },
  );

  it('does not allow context to replace reserved fields', () => {
    logger.info('request_completed', {
      timestamp: 'invalid',
      level: 'error',
      event: 'forged_event',
    });

    expect(readEntry(stdoutWrite)).toEqual({
      timestamp: now.toISOString(),
      level: 'info',
      event: 'request_completed',
    });
  });
});

function readEntry(write: jest.SpyInstance): Record<string, unknown> {
  const calls = write.mock.calls as unknown[][];
  const output = String(calls.at(0)?.at(0));
  return JSON.parse(output.trim()) as Record<string, unknown>;
}
