import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../generated/prisma/client';
import { WarningStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { disciplinaryCategorySelect } from './disciplinary-categories.service';
import {
  activeWarningTotalsAt,
  calculateWarningForCreation,
} from './warning-calculation';
import {
  activeWarningWhereAt,
  effectiveWarningStatusAt,
  warningSeverityPolicy,
  warningStatusWhereAt,
} from './warning-policy';
import { WARNING_TRANSACTION_ATTEMPTS } from './warnings.constants';
import {
  assertWarningReport,
  warningReportAlreadyUsed,
} from './warning-report';
import { CreateWarningDto, ListWarningsDto } from './warnings.dto';
import { warningDetailSelect, warningListSelect } from './warnings.select';
import {
  isWarningReportUniqueConflict,
  isWarningWriteConflict,
} from './warnings.transaction';
import {
  warningId,
  warningPaginationSkip,
  warningReason,
} from './warnings.validation';

const userNotFound = () =>
  new NotFoundException({
    code: 'USER_NOT_FOUND',
    message: 'Usuário não encontrado',
  });
const warningConflict = () =>
  new ConflictException({
    code: 'WARNING_CONFLICT',
    message:
      'Conflito ao alterar advertência; consulte o estado atual e tente novamente',
  });
const warningNotFound = () =>
  new NotFoundException({
    code: 'WARNING_NOT_FOUND',
    message: 'Advertência não encontrada',
  });

@Injectable()
export class WarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
    private readonly audit: AuditService,
  ) {}

  create(actorId: string, dto: CreateWarningDto, requestId?: string) {
    return this.writeTransaction(async (tx) => {
      await this.authorization.assertRoles(
        actorId,
        ADMINISTRATOR_REQUIREMENT,
        tx,
      );
      const userId = warningId(dto.userId);
      const categoryId = warningId(dto.categoryId);
      const reason = warningReason(dto.reason);
      const reportId =
        dto.reportId === undefined ? null : warningId(dto.reportId);
      warningSeverityPolicy(dto.severity);
      const at = new Date();
      if (
        !(await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        }))
      )
        throw userNotFound();
      const category = await tx.disciplinaryCategory.findUnique({
        where: { id: categoryId },
        select: { active: true },
      });
      if (!category)
        throw new NotFoundException({
          code: 'DISCIPLINARY_CATEGORY_NOT_FOUND',
          message: 'Categoria não encontrada',
        });
      if (!category.active)
        throw new ConflictException({
          code: 'DISCIPLINARY_CATEGORY_INACTIVE',
          message: 'A categoria precisa estar ativa',
        });
      if (reportId !== null)
        await assertWarningReport(tx, reportId, userId, categoryId);
      const calculation = await calculateWarningForCreation(
        tx,
        userId,
        categoryId,
        dto.severity,
        at,
      );
      const warning = await tx.warning.create({
        data: {
          userId,
          categoryId,
          reason,
          createdById: actorId,
          reportId,
          status: WarningStatus.ACTIVE,
          ...calculation,
        },
        select: warningDetailSelect,
      });
      await this.audit.record(tx, {
        actorId,
        requestId,
        action: AUDIT_ACTION.WARNING_CREATED,
        entityType: AUDIT_ENTITY.WARNING,
        entityId: warning.id,
        metadata: { changed: true, hasReport: reportId !== null },
      });
      return { ...warning, status: effectiveWarningStatusAt(warning, at) };
    }, dto.reportId);
  }

  list(actorId: string, query: ListWarningsDto) {
    return this.readTransaction(actorId, async (tx) => {
      const skip = warningPaginationSkip(query);
      const at = new Date();
      if (query.severity !== undefined) warningSeverityPolicy(query.severity);
      const where: Prisma.WarningWhereInput = {
        ...(query.userId !== undefined
          ? { userId: warningId(query.userId) }
          : {}),
        ...(query.categoryId !== undefined
          ? { categoryId: warningId(query.categoryId) }
          : {}),
        ...(query.severity !== undefined ? { severity: query.severity } : {}),
        ...(query.status !== undefined
          ? warningStatusWhereAt(query.status, at)
          : {}),
      };
      const items = await tx.warning.findMany({
        where,
        skip,
        take: query.limit,
        select: warningListSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const total = await tx.warning.count({ where });
      return {
        items: items.map((row) => ({
          ...row,
          status: effectiveWarningStatusAt(row, at),
        })),
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
      const warning = await tx.warning.findUnique({
        where: { id: warningId(id) },
        select: warningDetailSelect,
      });
      if (!warning) throw warningNotFound();
      return { ...warning, status: effectiveWarningStatusAt(warning, at) };
    });
  }

  reverse(actorId: string, id: string, reason: string, requestId?: string) {
    return this.writeTransaction(async (tx) => {
      await this.authorization.assertRoles(
        actorId,
        ADMINISTRATOR_REQUIREMENT,
        tx,
      );
      const warningIdValue = warningId(id);
      const reversalReason = warningReason(reason);
      const at = new Date();
      const original = await tx.warning.findUnique({
        where: { id: warningIdValue },
        select: warningDetailSelect,
      });
      if (!original) throw warningNotFound();
      const fromStatus = effectiveWarningStatusAt(original, at);
      const changed = original.status !== WarningStatus.REVERSED;
      if (changed) {
        const result = await tx.warning.updateMany({
          where: { id: warningIdValue, status: original.status },
          data: {
            status: WarningStatus.REVERSED,
            reversedById: actorId,
            reversedAt: at,
            reversalReason,
          },
        });
        if (result.count !== 1) throw warningConflict();
      }
      // A repeated request preserves the first decision, including updatedAt.
      const warning = changed
        ? await tx.warning.findUnique({
            where: { id: warningIdValue },
            select: warningDetailSelect,
          })
        : original;
      if (!warning) throw warningNotFound();
      await this.audit.record(tx, {
        actorId,
        requestId,
        action: AUDIT_ACTION.WARNING_REVERSED,
        entityType: AUDIT_ENTITY.WARNING,
        entityId: warningIdValue,
        metadata: { changed, fromStatus, toStatus: WarningStatus.REVERSED },
      });
      return warning;
    });
  }

  summary(actorId: string, userId: string) {
    return this.readTransaction(actorId, async (tx) => {
      warningId(userId);
      const at = new Date();
      if (
        !(await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        }))
      )
        throw userNotFound();
      const totals = await activeWarningTotalsAt(tx, userId, at);
      const groups = await tx.warning.groupBy({
        by: ['categoryId'],
        where: { userId, ...activeWarningWhereAt(at) },
        _count: { _all: true },
        _sum: { effectiveWeight: true },
        orderBy: { categoryId: 'asc' },
      });
      const categories = await tx.disciplinaryCategory.findMany({
        where: { id: { in: groups.map((group) => group.categoryId) } },
        select: disciplinaryCategorySelect,
      });
      const catalog = new Map(
        categories.map((category) => [category.id, category]),
      );
      return {
        userId,
        calculatedAt: at,
        ...totals,
        categories: groups
          .map((group) => {
            const category = catalog.get(group.categoryId);
            if (!category)
              throw new Error(
                'Warning category missing from transaction snapshot',
              );
            return {
              category,
              activeCount: group._count._all,
              totalActiveWeight:
                group._sum.effectiveWeight ?? new Prisma.Decimal(0),
            };
          })
          .sort(
            (a, b) =>
              a.category.code.localeCompare(b.category.code) ||
              a.category.id.localeCompare(b.category.id),
          ),
      };
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

  private async writeTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    reportId?: string,
  ): Promise<T> {
    for (let attempt = 0; attempt < WARNING_TRANSACTION_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (reportId !== undefined && isWarningReportUniqueConflict(error))
          throw warningReportAlreadyUsed();
        if (!isWarningWriteConflict(error)) throw error;
        if (attempt === WARNING_TRANSACTION_ATTEMPTS - 1)
          throw warningConflict();
      }
    }
    throw new Error('Unreachable warning transaction retry state');
  }
}
