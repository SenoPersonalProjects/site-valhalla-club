import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

// Populated exclusively by trusted authentication infrastructure.
type RequestWithUser = {
  user?: { id?: unknown };
};

export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = request.user?.id;

    if (typeof userId !== 'string' || !userId.trim()) {
      throw new UnauthorizedException({
        code: 'USER_CONTEXT_REQUIRED',
        message: 'É necessário um contexto de usuário autenticado',
      });
    }

    return userId.trim();
  },
);
