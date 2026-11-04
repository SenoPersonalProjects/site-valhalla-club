import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../audit/audit.constants';
import { AuthorizationService } from '../authorization/authorization.service';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { isTransactionWriteConflict } from '../common/database/transaction-conflict';
import { Prisma } from '../generated/prisma/client';
import { AppealStatus, WarningStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { assertDisciplinaryOwner } from '../sanctions/disciplinary-owner';
import {
  SANCTION_TRANSACTION_ATTEMPTS,
  SANCTION_TRANSACTION_TIMEOUT_MS,
} from '../sanctions/sanctions.constants';
import {
  invalidSanction,
  sanctionId,
  sanctionPagination,
  sanctionReason,
} from '../sanctions/sanctions.policy';
import { SanctionsService } from '../sanctions/sanctions.service';
import { APPEAL_MAX_ATTEMPTS } from './appeals.constants';
import {
  AdminAppealFiltersDto,
  CreateAppealDto,
  OwnAppealFiltersDto,
  OwnWarningFiltersDto,
  ReviewAppealDto,
} from './appeals.dto';
import {
  appealCaseRefs,
  appealConflict,
  appealFilters,
  isAppealUniqueConflict,
  loadAppealCase,
  warningFilters,
  warningState,
} from './appeals.policy';
import {
  adminAppealDetailSelect,
  appealListSelect,
  ownAppealDetailSelect,
  ownWarningDetailSelect,
  ownWarningListSelect,
} from './appeals.select';

@Injectable()
export class AppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
    private readonly sanctions: SanctionsService,
  ) {}

  create(userId: string, dto: CreateAppealDto, requestId?: string) {
    return this.writeTransaction(async (tx) => {
      await assertDisciplinaryOwner(tx, userId);
      const refs = appealCaseRefs(dto);
      const justification = sanctionReason(dto.justification);
      const target = await loadAppealCase(tx, refs, userId);
      if (target.status === WarningStatus.REVERSED)
        throw appealConflict(
          'APPEAL_CASE_CLOSED',
          'Uma medida revertida não recebe novos recursos',
        );
      // The case, not its report, related measures or user, owns this counter.
      const previous = await tx.appeal.findMany({
        where: refs,
        select: { sequence: true, status: true },
        take: APPEAL_MAX_ATTEMPTS + 1,
        orderBy: { sequence: 'desc' },
      });
      if (previous.some((row) => row.status === AppealStatus.APPROVED))
        throw appealConflict(
          'APPEAL_CASE_CLOSED',
          'O caso já possui recurso aprovado',
        );
      if (previous.some((row) => row.status === AppealStatus.PENDING))
        throw appealConflict(
          'APPEAL_PENDING',
          'Já existe recurso pendente para este caso',
        );
      const sequence = Math.max(0, ...previous.map((row) => row.sequence)) + 1;
      if (
        previous.length >= APPEAL_MAX_ATTEMPTS ||
        sequence > APPEAL_MAX_ATTEMPTS
      )
        throw appealConflict(
          'APPEAL_LIMIT_REACHED',
          'O caso já atingiu o limite de recursos',
        );
      const appeal = await tx.appeal.create({
        data: {
          ...refs,
          userId,
          sequence,
          justification,
          status: AppealStatus.PENDING,
        },
        select: ownAppealDetailSelect,
      });
      await this.audit.record(tx, {
        actorId: userId,
        requestId,
        action: AUDIT_ACTION.APPEAL_SUBMITTED,
        entityType: AUDIT_ENTITY.APPEAL,
        entityId: appeal.id,
        metadata: {
          changed: true,
          targetType: refs.warningId === null ? 'SANCTION' : 'WARNING',
          sequence,
        },
      });
      return appeal;
    }, true);
  }

  review(
    actorId: string,
    id: string,
    dto: ReviewAppealDto,
    requestId?: string,
  ) {
    return this.writeTransaction(async (tx) => {
      await this.authorization.assertRoles(
        actorId,
        ADMINISTRATOR_REQUIREMENT,
        tx,
      );
      if (
        dto.decision !== AppealStatus.APPROVED &&
        dto.decision !== AppealStatus.REJECTED
      )
        invalidSanction();
      const response = sanctionReason(dto.response);
      const appeal = await tx.appeal.findUnique({
        where: { id: sanctionId(id) },
        select: adminAppealDetailSelect,
      });
      if (!appeal) throw this.notFound();
      const refs = appealCaseRefs({
        warningId: appeal.warningId ?? undefined,
        sanctionId: appeal.sanctionId ?? undefined,
      });
      const target = await loadAppealCase(tx, refs);
      if (target.userId !== appeal.userId)
        throw appealConflict(
          'APPEAL_CASE_INVALID',
          'Vínculo do recurso incompatível com o caso',
        );
      if (actorId === appeal.userId || actorId === target.createdById)
        throw new ForbiddenException({
          code: 'APPEAL_INDEPENDENT_REVIEWER_REQUIRED',
          message: 'O recurso exige outro administrador autorizado',
        });
      const changed = appeal.status === AppealStatus.PENDING;
      if (!changed && appeal.status !== dto.decision)
        throw appealConflict(
          'APPEAL_ALREADY_REVIEWED',
          'O recurso já possui outra decisão',
        );
      let result = appeal;
      if (changed) {
        const at = new Date();
        if (dto.decision === AppealStatus.APPROVED) {
          if (refs.sanctionId !== null) {
            await this.sanctions.reverseInTransaction(
              tx,
              actorId,
              refs.sanctionId,
              { reason: response },
              requestId,
            );
          } else {
            await this.reverseWarning(
              tx,
              actorId,
              target,
              response,
              at,
              requestId,
            );
          }
        }
        const updated = await tx.appeal.updateMany({
          where: { id: appeal.id, status: AppealStatus.PENDING },
          data: {
            status: dto.decision,
            reviewedById: actorId,
            reviewedAt: at,
            response,
          },
        });
        if (updated.count !== 1) throw appealConflict();
        result = await tx.appeal.findUniqueOrThrow({
          where: { id: appeal.id },
          select: adminAppealDetailSelect,
        });
      }
      await this.audit.record(tx, {
        actorId,
        requestId,
        action: AUDIT_ACTION.APPEAL_REVIEWED,
        entityType: AUDIT_ENTITY.APPEAL,
        entityId: appeal.id,
        metadata: {
          changed,
          fromStatus: appeal.status,
          toStatus: dto.decision,
          targetType: refs.warningId === null ? 'SANCTION' : 'WARNING',
          sequence: appeal.sequence,
        },
      });
      return result;
    });
  }

  private async reverseWarning(
    tx: Prisma.TransactionClient,
    actorId: string,
    target: Awaited<ReturnType<typeof loadAppealCase>>,
    reason: string,
    at: Date,
    requestId?: string,
  ) {
    const changed = target.status !== WarningStatus.REVERSED;
    if (changed) {
      const result = await tx.warning.updateMany({
        where: {
          id: target.id,
          status: { in: [WarningStatus.ACTIVE, WarningStatus.EXPIRED] },
        },
        data: {
          status: WarningStatus.REVERSED,
          reversedById: actorId,
          reversedAt: at,
          reversalReason: reason,
        },
      });
      if (result.count !== 1) throw appealConflict();
    }
    await this.audit.record(tx, {
      actorId,
      requestId,
      action: AUDIT_ACTION.WARNING_REVERSED,
      entityType: AUDIT_ENTITY.WARNING,
      entityId: target.id,
      metadata: {
        changed,
        fromStatus: target.status,
        toStatus: WarningStatus.REVERSED,
      },
    });
  }

  listOwn(userId: string, query: OwnAppealFiltersDto) {
    return this.readTransaction(userId, false, (tx) =>
      this.appealPage(tx, query, userId),
    );
  }

  listAdmin(actorId: string, query: AdminAppealFiltersDto) {
    return this.readTransaction(actorId, true, (tx) =>
      this.appealPage(tx, query),
    );
  }

  private async appealPage(
    tx: Prisma.TransactionClient,
    query: AdminAppealFiltersDto,
    ownerId?: string,
  ) {
    const skip = sanctionPagination({ page: query.page, limit: query.limit });
    const where = {
      ...appealFilters(query),
      ...(ownerId === undefined ? {} : { userId: ownerId }),
    };
    const items = await tx.appeal.findMany({
      where,
      select: appealListSelect,
      skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const total = await tx.appeal.count({ where });
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  findOwn(userId: string, id: string) {
    return this.readTransaction(userId, false, async (tx) => {
      const appeal = await tx.appeal.findFirst({
        where: { id: sanctionId(id), userId },
        select: ownAppealDetailSelect,
      });
      if (!appeal) throw this.notFound();
      return appeal;
    });
  }

  findAdmin(actorId: string, id: string) {
    return this.readTransaction(actorId, true, async (tx) => {
      const appeal = await tx.appeal.findUnique({
        where: { id: sanctionId(id) },
        select: adminAppealDetailSelect,
      });
      if (!appeal) throw this.notFound();
      return appeal;
    });
  }

  listWarningsOwn(userId: string, query: OwnWarningFiltersDto) {
    return this.readTransaction(userId, false, async (tx) => {
      const skip = sanctionPagination({ page: query.page, limit: query.limit });
      const at = new Date();
      const where = warningFilters(userId, query.status, at);
      const rows = await tx.warning.findMany({
        where,
        select: ownWarningListSelect,
        skip,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const total = await tx.warning.count({ where });
      return {
        items: rows.map((row) => warningState(row, at)),
        meta: {
          page: query.page,
          limit: query.limit,
          total,
          pages: Math.ceil(total / query.limit),
        },
      };
    });
  }

  findWarningOwn(userId: string, id: string) {
    return this.readTransaction(userId, false, async (tx) => {
      const row = await tx.warning.findFirst({
        where: { id: sanctionId(id), userId },
        select: ownWarningDetailSelect,
      });
      if (!row)
        throw new NotFoundException({
          code: 'WARNING_NOT_FOUND',
          message: 'Advertência não encontrada',
        });
      return warningState(row, new Date());
    });
  }

  private notFound() {
    return new NotFoundException({
      code: 'APPEAL_NOT_FOUND',
      message: 'Recurso não encontrado',
    });
  }

  private readTransaction<T>(
    actorId: string,
    admin: boolean,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        if (admin)
          await this.authorization.assertRoles(
            actorId,
            ADMINISTRATOR_REQUIREMENT,
            tx,
          );
        else await assertDisciplinaryOwner(tx, actorId);
        return operation(tx);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async writeTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    retryUnique = false,
  ): Promise<T> {
    for (let attempt = 0; attempt < SANCTION_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: SANCTION_TRANSACTION_TIMEOUT_MS,
        });
      } catch (error) {
        if (
          !isTransactionWriteConflict(error) &&
          !(retryUnique && isAppealUniqueConflict(error))
        )
          throw error;
        if (attempt === SANCTION_TRANSACTION_ATTEMPTS - 1)
          throw appealConflict();
      }
    }
    throw new Error('Unreachable appeal transaction retry state');
  }
}
