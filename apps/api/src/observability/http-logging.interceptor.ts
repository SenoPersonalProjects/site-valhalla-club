import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestWithId } from './request-id.middleware';
import { StructuredLoggerService } from './structured-logger.service';

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
      route: this.getRoute(request),
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

  private getRoute(request: RequestWithId): string {
    const routeDefinition = (request as unknown as { route?: unknown }).route;
    const routePath = this.getRoutePath(routeDefinition);
    const path = typeof routePath === 'string' ? routePath : request.path;

    return `${request.baseUrl}${path}` || '/';
  }

  private getRoutePath(routeDefinition: unknown): unknown {
    if (routeDefinition === null || typeof routeDefinition !== 'object') {
      return undefined;
    }

    return (routeDefinition as Record<string, unknown>).path;
  }
}
