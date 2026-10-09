import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { RequestWithId } from './request-id.middleware';
import { StructuredLoggerService } from './structured-logger.service';

type ErrorMessage = string | string[];

type ExceptionPayload = {
  code?: unknown;
  message?: unknown;
};

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const request = httpContext.getRequest<RequestWithId>();
    const response = httpContext.getResponse<Response>();
    const statusCode = this.getStatusCode(exception);

    this.logger.error('request_failed', {
      requestId: request.requestId,
      method: request.method,
      route: request.path,
      statusCode,
      durationMs: Math.max(0, Date.now() - request.requestStartedAt),
    });

    response.status(statusCode).json({
      statusCode,
      code: this.getErrorCode(exception, statusCode),
      message: this.getErrorMessage(exception, statusCode),
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.path,
    });
  }

  private getStatusCode(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getErrorCode(exception: unknown, statusCode: number): string {
    const payload = this.getExceptionPayload(exception);

    if (
      typeof payload?.code === 'string' &&
      ERROR_CODE_PATTERN.test(payload.code)
    ) {
      return payload.code;
    }

    const statusName: unknown = HttpStatus[statusCode];
    return typeof statusName === 'string' ? statusName : 'HTTP_ERROR';
  }

  private getErrorMessage(
    exception: unknown,
    statusCode: number,
  ): ErrorMessage {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const response: unknown = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    const payload = this.toExceptionPayload(response);
    const message = payload?.message;

    if (typeof message === 'string') {
      return message;
    }

    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message;
    }

    const statusName: unknown = HttpStatus[statusCode];
    return typeof statusName === 'string' ? statusName : 'HTTP error';
  }

  private getExceptionPayload(
    exception: unknown,
  ): ExceptionPayload | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    return this.toExceptionPayload(exception.getResponse());
  }

  private toExceptionPayload(value: unknown): ExceptionPayload | undefined {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value;
  }
}
