import { Injectable } from '@nestjs/common';
import {
  AuthorizationService,
  AuthorizationClient,
} from '../authorization/authorization.service';
import {
  ADMINISTRATOR_REQUIREMENT,
  MASTER_REQUIREMENT,
} from '../authorization/authorization.policies';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { forbidden, notFound } from './table-domain.errors';

@Injectable()
export class TableActorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async assertMaster(
    userId: string,
    client: AuthorizationClient = this.prisma,
  ): Promise<void> {
    await this.authorization.assertRoles(userId, MASTER_REQUIREMENT, client);
  }

  async assertAdministrator(
    userId: string,
    client: AuthorizationClient = this.prisma,
  ): Promise<void> {
    await this.authorization.assertRoles(
      userId,
      ADMINISTRATOR_REQUIREMENT,
      client,
    );
  }

  async assertCanManage(
    ownerId: string,
    actorId: string,
    client: AuthorizationClient = this.prisma,
  ): Promise<void> {
    if (ownerId === actorId) {
      await this.assertMaster(actorId, client);
      return;
    }
    await this.assertAdministrator(actorId, client);
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
