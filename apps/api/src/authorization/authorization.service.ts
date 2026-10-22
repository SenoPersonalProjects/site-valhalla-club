import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AccountStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { RoleRequirement } from './authorization.policies';

export type AuthorizationClient = Pick<Prisma.TransactionClient, 'user'>;

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertRoles(
    userId: string,
    requirement: RoleRequirement,
    client: AuthorizationClient = this.prisma,
  ): Promise<void> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        ...(requirement.systemRoles !== undefined && { systemRole: true }),
        ...(requirement.clubRoles !== undefined && {
          clubRoles: { select: { role: true } },
        }),
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'Usuário não encontrado',
      });
    }
    if (user.status !== AccountStatus.APPROVED) {
      throw new ForbiddenException(
        requirement.errors?.accountNotApproved ?? {
          code: 'ACCOUNT_NOT_APPROVED',
          message: 'A conta precisa estar aprovada',
        },
      );
    }
    // OR within each group; independent groups must both be satisfied.
    // An explicitly empty requirement fails closed.
    if (
      requirement.systemRoles !== undefined &&
      !requirement.systemRoles.includes(user.systemRole)
    ) {
      throw new ForbiddenException(
        requirement.errors?.systemRoleRequired ?? {
          code: 'SYSTEM_ROLE_REQUIRED',
          message: 'A operação exige um papel de sistema autorizado',
        },
      );
    }
    if (
      requirement.clubRoles !== undefined &&
      !user.clubRoles.some(({ role }) => requirement.clubRoles!.includes(role))
    ) {
      throw new ForbiddenException(
        requirement.errors?.clubRoleRequired ?? {
          code: 'CLUB_ROLE_REQUIRED',
          message: 'A operação exige um papel de clube autorizado',
        },
      );
    }
  }
}
