import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AccountStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_ROUTE } from './public.decorator';

export const unauthorized = (code: string) =>
  new UnauthorizedException({
    code,
    message: 'Autenticação necessária ou sessão inválida',
  });

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();
    delete request.user;
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const header = request.headers.authorization;
    if (!header) throw unauthorized('AUTH_TOKEN_REQUIRED');
    const match = /^Bearer ([^\s]+)$/i.exec(header);
    if (!match) throw unauthorized('AUTH_TOKEN_INVALID');
    let claims: Record<string, unknown>;
    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(match[1], {
        algorithms: ['HS256'],
      });
      if (
        typeof claims.sub !== 'string' ||
        !claims.sub.trim() ||
        claims.type !== 'access' ||
        !Number.isSafeInteger(claims.ver) ||
        Number(claims.ver) < 0 ||
        typeof claims.exp !== 'number' ||
        !Number.isFinite(claims.exp)
      ) {
        throw new Error('Invalid claims');
      }
    } catch {
      throw unauthorized('AUTH_TOKEN_INVALID');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub as string },
      select: { id: true, status: true, authVersion: true },
    });
    if (!user) throw unauthorized('AUTH_TOKEN_INVALID');
    if (user.status !== AccountStatus.APPROVED)
      throw unauthorized('AUTH_ACCOUNT_UNAVAILABLE');
    if (user.authVersion !== claims.ver)
      throw unauthorized('AUTH_TOKEN_REVOKED');
    request.user = { id: user.id };
    return true;
  }
}
