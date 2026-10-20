import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from './table-actors.service';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: TableActorsService,
  ) {}

  async findForUser(userId: string) {
    await this.actors.assertUserExists(userId);

    const [campaigns, oneShots, participations] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { masterId: userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          gameSystem: { select: { id: true, code: true, name: true } },
          sessions: {
            orderBy: { scheduledAt: 'asc' },
            select: {
              id: true,
              title: true,
              scheduledAt: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.oneShot.findMany({
        where: { masterId: userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          gameSystem: { select: { id: true, code: true, name: true } },
          session: {
            select: {
              id: true,
              title: true,
              scheduledAt: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.sessionParticipant.findMany({
        where: { userId },
        orderBy: { registeredAt: 'desc' },
        include: {
          session: {
            include: {
              campaign: {
                select: { id: true, title: true, masterId: true },
              },
              oneShot: {
                select: { id: true, title: true, masterId: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      mastered: { campaigns, oneShots },
      participating: participations,
    };
  }
}
