import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

export const USER_ID_HEADER = 'x-user-id';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const rawUserId = request.headers[USER_ID_HEADER];
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

    if (!userId?.trim()) {
      throw new UnauthorizedException({
        code: 'USER_CONTEXT_REQUIRED',
        message: `O cabeçalho ${USER_ID_HEADER} é obrigatório nesta fase da API`,
      });
    }

    return userId.trim();
  },
);
