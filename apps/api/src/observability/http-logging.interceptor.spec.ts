import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { StructuredLoggerService } from './structured-logger.service';

type LogMethod = (
  event: string,
  context?: Readonly<Record<string, unknown>>,
) => void;

type LoggerMock = {
  info: jest.MockedFunction<LogMethod>;
  warn: jest.MockedFunction<LogMethod>;
  error: jest.MockedFunction<LogMethod>;
};

describe('HttpLoggingInterceptor', () => {
  let logger: LoggerMock;
  let interceptor: HttpLoggingInterceptor;

  beforeEach(() => {
    logger = {
      info: jest.fn<LogMethod>(),
      warn: jest.fn<LogMethod>(),
      error: jest.fn<LogMethod>(),
    };
    interceptor = new HttpLoggingInterceptor(
      logger as unknown as StructuredLoggerService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs a completed request with status and duration', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(125);
    const context = createHttpContext(200);
    const next: CallHandler = { handle: () => of({ status: 'ok' }) };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(logger.info).toHaveBeenNthCalledWith(1, 'request_received', {
      requestId: 'request-123',
      method: 'GET',
      route: '/health',
    });
    expect(logger.info).toHaveBeenNthCalledWith(2, 'request_completed', {
      requestId: 'request-123',
      method: 'GET',
      route: '/health',
      statusCode: 200,
      durationMs: 25,
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('rethrows request failures for the global exception filter', async () => {
    const exception = new BadRequestException('invalid request');
    const context = createHttpContext(200);
    const next: CallHandler = {
      handle: () => throwError(() => exception),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(exception);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

function createHttpContext(statusCode: number): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({
        requestId: 'request-123',
        requestStartedAt: 100,
        method: 'GET',
        route: { path: '/health' },
        path: '/health',
        baseUrl: '',
      }),
      getResponse: () => ({ statusCode }),
    }),
  } as ExecutionContext;
}
