import { Injectable } from '@nestjs/common';
import { AccountStatus, ClubRole, SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { forbidden, notFound } from './table-domain.errors';

@Injectable()
export class TableActorsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertMaster(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        clubRoles: {
          where: { role: ClubRole.MASTER },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'Usuário não encontrado');
    }

    if (user.status !== AccountStatus.APPROVED) {
      throw forbidden(
        'MASTER_ACCOUNT_NOT_APPROVED',
        'A conta do mestre precisa estar aprovada',
      );
    }

    if (user.clubRoles.length === 0) {
      throw forbidden(
        'MASTER_ROLE_REQUIRED',
        'O usuário não possui o papel de mestre',
      );
    }
  }

  async assertAdministrator(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        systemRole: true,
      },
    });

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'Usuário não encontrado');
    }

    const hasAdministrativeRole =
      user.systemRole === SystemRole.ADMIN ||
      user.systemRole === SystemRole.DEV;

    if (user.status !== AccountStatus.APPROVED || !hasAdministrativeRole) {
      throw forbidden(
        'ADMIN_ROLE_REQUIRED',
        'A operação exige um administrador aprovado',
      );
    }
  }

  async assertCanManage(ownerId: string, actorId: string): Promise<void> {
    if (ownerId === actorId) {
      await this.assertMaster(actorId);
      return;
    }

    await this.assertAdministrator(actorId);
  }

  async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw notFound('USER_NOT_FOUND', 'Usuário não encontrado');
    }
  }

  async assertActiveGameSystem(
    gameSystemId: string,
    client: Pick<Prisma.TransactionClient, 'gameSystem'> = this.prisma,
  ): Promise<void> {
    const gameSystem = await client.gameSystem.findUnique({
      where: { id: gameSystemId },
      select: { active: true },
    });

    if (!gameSystem) {
      throw notFound('GAME_SYSTEM_NOT_FOUND', 'Sistema de RPG não encontrado');
    }

    if (!gameSystem.active) {
      throw forbidden(
        'GAME_SYSTEM_INACTIVE',
        'O sistema de RPG selecionado está inativo',
      );
    }
  }
}
