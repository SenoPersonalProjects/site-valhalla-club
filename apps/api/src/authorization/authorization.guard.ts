import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE } from '../auth/public.decorator';
import { ClubRole, SystemRole } from '../generated/prisma/enums';
import { RoleRequirement } from './authorization.policies';
import { AuthorizationService } from './authorization.service';
import {
  CLUB_ROLES_KEY,
  ROLE_ERRORS_KEY,
  SYSTEM_ROLES_KEY,
} from './require-roles.decorator';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }
    const systemRoles = this.reflector.getAllAndOverride<readonly SystemRole[]>(
      SYSTEM_ROLES_KEY,
      targets,
    );
    const clubRoles = this.reflector.getAllAndOverride<readonly ClubRole[]>(
      CLUB_ROLES_KEY,
      targets,
    );
    if (systemRoles === undefined && clubRoles === undefined) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: unknown } }>();
    const id = request.user?.id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new UnauthorizedException({
        code: 'USER_CONTEXT_REQUIRED',
        message: 'É necessário um contexto de usuário autenticado',
      });
    }
    await this.authorization.assertRoles(id, {
      systemRoles,
      clubRoles,
      errors: this.reflector.getAllAndOverride<RoleRequirement['errors']>(
        ROLE_ERRORS_KEY,
        targets,
      ),
    });
    return true;
  }
}
