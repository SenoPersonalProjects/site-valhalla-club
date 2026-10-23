import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../../authorization/authorization.policies';
import { AuthorizationService } from '../../authorization/authorization.service';
import { Prisma } from '../../generated/prisma/client';
import {
  AccountStatus,
  ClubRole,
  SystemRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { ListAdminUsersDto } from './admin-users.dto';
import {
  adminUserDetailSelect,
  adminUserListSelect,
} from './admin-users.select';

const roleConflict = () =>
  new ConflictException({
    code: 'USER_ROLE_CONFLICT',
    message:
      'Conflito ao alterar papéis; consulte o estado atual e tente novamente',
  });
const operationNotAllowed = () =>
  new ConflictException({
    code: 'USER_ADMIN_OPERATION_NOT_ALLOWED',
    message: 'A operação exige outra conta aprovada como alvo',
  });
const userNotFound = () =>
  new NotFoundException({
    code: 'USER_NOT_FOUND',
    message: 'Usuário não encontrado',
  });

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async list(actorId: string, query: ListAdminUsersDto) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          transaction,
        );
        const where: Prisma.UserWhereInput = {
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.systemRole !== undefined
            ? { systemRole: query.systemRole }
            : {}),
        };
        const skip = (query.page - 1) * query.limit;
        if (!Number.isSafeInteger(skip) || skip > 2_147_483_647) {
          throw new BadRequestException({
            code: 'BAD_REQUEST',
            message: 'Paginação fora do intervalo suportado',
          });
        }
        const items = await transaction.user.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: adminUserListSelect,
        });
        const total = await transaction.user.count({ where });
        return {
          items,
          meta: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findOne(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          transaction,
        );
        const user = await transaction.user.findUnique({
          where: { id },
          select: adminUserDetailSelect,
        });
        if (!user) throw userNotFound();
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async changeSystemRole(id: string, actorId: string, systemRole: SystemRole) {
    return this.systemRoleTransaction(async (transaction) => {
      const user = await this.assertTarget(transaction, id, actorId);
      if (user.systemRole !== systemRole) {
        const result = await transaction.user.updateMany({
          where: {
            id,
            status: AccountStatus.APPROVED,
            systemRole: user.systemRole,
          },
          data: { systemRole },
        });
        if (!result.count) throw roleConflict();
      }
      return { id, systemRole };
    });
  }

  async grantClubRole(id: string, actorId: string, role: ClubRole) {
    return this.clubRoleTransaction(async (transaction) => {
      await this.assertTarget(transaction, id, actorId);
      return transaction.userClubRole.upsert({
        where: { userId_role: { userId: id, role } },
        create: {
          userId: id,
          role,
          grantedById: actorId,
          grantedAt: new Date(),
        },
        update: {},
        select: { role: true, grantedAt: true },
      });
    });
  }

  async removeClubRole(
    id: string,
    actorId: string,
    role: ClubRole,
  ): Promise<void> {
    return this.clubRoleTransaction(async (transaction) => {
      await this.assertTarget(transaction, id, actorId);
      await transaction.userClubRole.deleteMany({
        where: { userId: id, role },
      });
    });
  }

  private async assertTarget(
    transaction: Prisma.TransactionClient,
    id: string,
    actorId: string,
  ) {
    // Authoritative check in every transaction attempt, not merely the HTTP guard.
    await this.authorization.assertRoles(
      actorId,
      ADMINISTRATOR_REQUIREMENT,
      transaction,
    );
    if (id === actorId) throw operationNotAllowed();
    const user = await transaction.user.findUnique({
      where: { id },
      select: { id: true, status: true, systemRole: true },
    });
    if (!user) throw userNotFound();
    if (user.status !== AccountStatus.APPROVED) throw operationNotAllowed();
    return user;
  }

  private async clubRoleTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // Club roles do not authorize the operator. Unique/upsert and atomic delete
    // suffice here; validate actor/target in this transaction, without retries.
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      )
        throw roleConflict();
      throw error;
    }
  }

  private async systemRoleTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // Mutual system-role demotion can invalidate both authorization reads even
    // when each target CAS succeeds. Retry the entire Serializable operation.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError))
          throw error;
        if (error.code !== 'P2034') throw error;
        if (attempt === 2) throw roleConflict();
      }
    }
    throw new Error('Unreachable transaction retry state');
  }
}
