import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestWithId } from './request-id.middleware';
import { StructuredLoggerService } from './structured-logger.service';
import { httpRoute } from './http-route';

type HttpResponse = {
  statusCode: number;
};

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithId>();
    const response = httpContext.getResponse<HttpResponse>();
    const metadata = {
      requestId: request.requestId,
      method: request.method,
      route: httpRoute(request),
    };

    this.logger.info('request_received', metadata);

    return next.handle().pipe(
      tap({
        complete: () => {
          this.logger.info('request_completed', {
            ...metadata,
            statusCode: response.statusCode,
            durationMs: Date.now() - request.requestStartedAt,
          });
        },
      }),
    );
  }
}
