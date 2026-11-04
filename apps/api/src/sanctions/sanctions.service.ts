import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../audit/audit.constants';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../generated/prisma/client';
import { SanctionStatus } from '../generated/prisma/enums';
import { assertDisciplinaryOwner } from './disciplinary-owner';
import { PrismaService } from '../prisma/prisma.service';
import {
  SANCTION_EXPIRATION_BATCH_SIZE,
  SANCTION_TRANSACTION_ATTEMPTS,
  SANCTION_TRANSACTION_TIMEOUT_MS,
} from './sanctions.constants';
import {
  CreateSanctionDto,
  OwnSanctionFiltersDto,
  ReverseSanctionDto,
  SanctionFiltersDto,
} from './sanctions.dto';
import { assertSanctionOrigin } from './sanctions.origin';
import {
  sanctionCreation,
  sanctionId,
  sanctionListWhere,
  sanctionPagination,
  sanctionReason,
  sanctionReference,
  sanctionState,
} from './sanctions.policy';
import {
  ownSanctionDetailSelect,
  sanctionDetailSelect,
  sanctionListSelect,
} from './sanctions.select';
import { isTransactionWriteConflict } from '../common/database/transaction-conflict';

@Injectable()
export class SanctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  async create(actorId: string, dto: CreateSanctionDto, requestId?: string) {
    return this.writeTransaction(async (tx) => {
      await this.authorization.assertRoles(
        actorId,
        ADMINISTRATOR_REQUIREMENT,
        tx,
      );
      const at = new Date();
      const data = sanctionCreation(dto, at);
      if (
        !(await tx.user.findUnique({
          where: { id: data.userId },
          select: { id: true },
        }))
      )
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: 'Usuário não encontrado',
        });
      if (
        data.campaignId !== null &&
        !(await tx.campaign.findUnique({
          where: { id: data.campaignId },
          select: { id: true },
        }))
      )
        throw new NotFoundException({
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campanha não encontrada',
        });
      if (
        data.sessionId !== null &&
        !(await tx.session.findUnique({
          where: { id: data.sessionId },
          select: { id: true },
        }))
      )
        throw new NotFoundException({
          code: 'SESSION_NOT_FOUND',
          message: 'Sessão não encontrada',
        });
      await assertSanctionOrigin(tx, data);
      // Request IDs correlate logs; they are never used as idempotency keys.
      // A duplicate is the same unexpired decision, issuer, scope and origin.
      const duplicate = await tx.sanction.findFirst({
        where: {
          ...data,
          createdById: actorId,
          status: SanctionStatus.ACTIVE,
          startsAt: dto.startsAt === undefined ? { lte: at } : data.startsAt,
        },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException({
          code: 'SANCTION_ALREADY_EXISTS',
          message: 'Esta decisão já possui uma sanção ativa equivalente',
        });
      const sanction = await tx.sanction.create({
        data: {
          ...data,
          createdById: actorId,
          status: SanctionStatus.ACTIVE,
          createdAt: at,
        },
        select: sanctionDetailSelect,
      });
      await this.audit.record(tx, {
        actorId,
        requestId,
        action: AUDIT_ACTION.SANCTION_CREATED,
        entityType: AUDIT_ENTITY.SANCTION,
        entityId: sanction.id,
        metadata: {
          changed: true,
          type: data.type,
          scopeType: data.scopeType,
          hasReport: data.reportId !== null,
          hasWarning: data.warningId !== null,
        },
      });
      return { ...sanction, ...sanctionState(sanction, at) };
    });
  }

  reverse(
    actorId: string,
    id: string,
    dto: ReverseSanctionDto,
    requestId?: string,
  ) {
    return this.writeTransaction((tx) =>
      this.reverseInTransaction(tx, actorId, id, dto, requestId),
    );
  }

  // Approval of a sanction appeal must share this transaction and reversal logic.
  async reverseInTransaction(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    dto: ReverseSanctionDto,
    requestId?: string,
  ) {
    await this.authorization.assertRoles(
      actorId,
      ADMINISTRATOR_REQUIREMENT,
      tx,
    );
    const reason = sanctionReason(dto.reason);
    const sanction = await tx.sanction.findUnique({
      where: { id: sanctionId(id) },
      select: sanctionDetailSelect,
    });
    if (!sanction)
      throw new NotFoundException({
        code: 'SANCTION_NOT_FOUND',
        message: 'Sanção não encontrada',
      });
    const at = new Date();
    const changed = sanction.status !== SanctionStatus.REVERSED;
    let result = sanction;
    if (changed) {
      const updated = await tx.sanction.updateMany({
        where: {
          id: sanction.id,
          status: { in: [SanctionStatus.ACTIVE, SanctionStatus.EXPIRED] },
        },
        data: {
          status: SanctionStatus.REVERSED,
          reversedById: actorId,
          reversedAt: at,
          reversalReason: reason,
        },
      });
      if (updated.count !== 1) throw this.writeConflict();
      result = await tx.sanction.findUniqueOrThrow({
        where: { id: sanction.id },
        select: sanctionDetailSelect,
      });
    }
    await this.audit.record(tx, {
      actorId,
      requestId,
      action: AUDIT_ACTION.SANCTION_REVERSED,
      entityType: AUDIT_ENTITY.SANCTION,
      entityId: sanction.id,
      metadata: {
        changed,
        fromStatus: sanction.status,
        toStatus: SanctionStatus.REVERSED,
      },
    });
    return { ...result, ...sanctionState(result, at) };
  }

  expireDue(now = new Date()) {
    const at = sanctionReference(now);
    return this.writeTransaction(async (tx) => {
      const due = {
        status: SanctionStatus.ACTIVE,
        endsAt: { lte: at },
      } satisfies Prisma.SanctionWhereInput;
      const sanctions = await tx.sanction.findMany({
        where: due,
        select: { id: true },
        take: SANCTION_EXPIRATION_BATCH_SIZE,
        orderBy: { id: 'asc' },
      });
      let count = 0;
      for (const sanction of sanctions) {
        const updated = await tx.sanction.updateMany({
          where: { ...due, id: sanction.id },
          data: { status: SanctionStatus.EXPIRED },
        });
        if (updated.count === 0) continue;
        await this.audit.record(tx, {
          actorId: null,
          action: AUDIT_ACTION.SANCTION_EXPIRED,
          entityType: AUDIT_ENTITY.SANCTION,
          entityId: sanction.id,
          metadata: {
            changed: true,
            fromStatus: SanctionStatus.ACTIVE,
            toStatus: SanctionStatus.EXPIRED,
          },
        });
        count++;
      }
      return { count };
    });
  }

  private writeConflict() {
    return new ConflictException({
      code: 'SANCTION_CONFLICT',
      message:
        'Conflito ao alterar sanção; consulte o estado atual e tente novamente',
    });
  }

  private async writeTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < SANCTION_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: SANCTION_TRANSACTION_TIMEOUT_MS,
        });
      } catch (error) {
        if (!isTransactionWriteConflict(error)) throw error;
        if (attempt === SANCTION_TRANSACTION_ATTEMPTS - 1)
          throw this.writeConflict();
      }
    }
    throw new Error('Unreachable sanction transaction retry state');
  }

  list(actorId: string, query: SanctionFiltersDto) {
    return this.readTransaction(actorId, async (tx) => {
      const skip = sanctionPagination(query);
      const at = new Date();
      const where = sanctionListWhere(query, at);
      const items = await tx.sanction.findMany({
        where,
        skip,
        take: query.limit,
        select: sanctionListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const total = await tx.sanction.count({ where });
      return {
        items: items.map((row) => ({ ...row, ...sanctionState(row, at) })),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      };
    });
  }

  findOne(actorId: string, id: string) {
    return this.readTransaction(actorId, async (tx) => {
      const at = new Date();
      const sanction = await tx.sanction.findUnique({
        where: { id: sanctionId(id) },
        select: sanctionDetailSelect,
      });
      if (!sanction)
        throw new NotFoundException({
          code: 'SANCTION_NOT_FOUND',
          message: 'Sanção não encontrada',
        });
      return { ...sanction, ...sanctionState(sanction, at) };
    });
  }

  private readTransaction<T>(
    actorId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          tx,
        );
        return operation(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  listOwn(userId: string, query: OwnSanctionFiltersDto) {
    return this.ownTransaction(userId, async (tx) => {
      const skip = sanctionPagination(query);
      const at = new Date();
      const where = sanctionListWhere({ ...query, userId }, at);
      const items = await tx.sanction.findMany({
        where,
        skip,
        take: query.limit,
        select: sanctionListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const total = await tx.sanction.count({ where });
      return {
        items: items.map((row) => ({ ...row, ...sanctionState(row, at) })),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      };
    });
  }

  findOwn(userId: string, id: string) {
    return this.ownTransaction(userId, async (tx) => {
      const at = new Date();
      const sanction = await tx.sanction.findFirst({
        where: { id: sanctionId(id), userId },
        select: ownSanctionDetailSelect,
      });
      if (!sanction)
        throw new NotFoundException({
          code: 'SANCTION_NOT_FOUND',
          message: 'Sanção não encontrada',
        });
      return { ...sanction, ...sanctionState(sanction, at) };
    });
  }

  private ownTransaction<T>(
    actorId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await assertDisciplinaryOwner(tx, actorId);
        return operation(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
