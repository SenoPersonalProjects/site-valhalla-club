import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithId } from '../../observability/request-id.middleware';

export const CurrentRequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<Partial<RequestWithId>>().requestId,
);
