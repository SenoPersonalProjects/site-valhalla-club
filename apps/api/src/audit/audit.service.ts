import { BadRequestException, Injectable } from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEvent } from './audit.constants';
import { ListAuditLogsDto } from './audit.dto';

export const auditLogSelect = {
  id: true,
  actorId: true,
  action: true,
  entityType: true,
  entityId: true,
  requestId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async record(
    transaction: Prisma.TransactionClient,
    event: AuditEvent,
  ): Promise<void> {
    // Explicit event contracts, never HTTP payloads or complete domain objects.
    await transaction.auditLog.create({
      data: {
        actorId: event.actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        requestId: event.requestId ?? null,
        metadata: event.metadata,
      },
    });
  }

  async list(actorId: string, query: ListAuditLogsDto) {
    return this.prisma.$transaction(
      async (transaction) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          transaction,
        );
        const skip = (query.page - 1) * query.limit;
        if (
          !Number.isSafeInteger(skip) ||
          skip > 2_147_483_647 ||
          (query.entityId !== undefined && query.entityType === undefined)
        ) {
          throw new BadRequestException({
            code: 'BAD_REQUEST',
            message: 'Paginação ou filtros inválidos',
          });
        }
        const where: Prisma.AuditLogWhereInput = {
          ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
          ...(query.entityType !== undefined
            ? { entityType: query.entityType }
            : {}),
          ...(query.entityId !== undefined ? { entityId: query.entityId } : {}),
          ...(query.requestId !== undefined
            ? { requestId: query.requestId }
            : {}),
        };
        const items = await transaction.auditLog.findMany({
          where,
          skip,
          take: query.limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: auditLogSelect,
        });
        const total = await transaction.auditLog.count({ where });
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
}
