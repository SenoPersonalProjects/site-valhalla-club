import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ApprovalStatus,
  OneShotStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { TableRulesService } from '../tables/table-rules.service';
import { CorrectOneShotDto } from './dto/correct-one-shot.dto';
import { badRequest, conflict, notFound } from '../tables/table-domain.errors';
import { ChangeOneShotStatusDto } from './dto/change-one-shot-status.dto';
import { CreateOneShotDto } from './dto/create-one-shot.dto';
import { ReviewOneShotDto } from './dto/review-one-shot.dto';
import { UpdateOneShotDto } from './dto/update-one-shot.dto';

const oneShotPrivateDetails = {
  master: {
    select: {
      id: true,
      profile: { select: { displayName: true } },
    },
  },
  gameSystem: { select: { id: true, code: true, name: true } },
  session: {
    include: {
      _count: {
        select: {
          participants: true,
          feedbacks: true,
          reports: true,
          sanctionScopes: true,
        },
      },
    },
  },
} satisfies Prisma.OneShotInclude;

const oneShotPublicDetails = {
  id: true,
  title: true,
  description: true,
  status: true,
  master: { select: { profile: { select: { displayName: true } } } },
  gameSystem: { select: { id: true, code: true, name: true } },
  session: {
    select: { id: true, title: true, scheduledAt: true, status: true },
  },
} satisfies Prisma.OneShotSelect;

@Injectable()
export class OneShotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: TableActorsService,
    private readonly rules: TableRulesService,
  ) {}

  async create(actorId: string, dto: CreateOneShotDto) {
    await Promise.all([
      this.actors.assertMaster(actorId),
      this.actors.assertActiveGameSystem(dto.gameSystemId),
    ]);

    return this.rules.serializable(async (transaction) => {
      const scheduledAt = this.rules.parseOneShotDate(dto.session.scheduledAt);
      await this.rules.assertOneShotCapacity(
        transaction,
        dto.gameSystemId,
        scheduledAt,
      );
      return transaction.oneShot.create({
        data: {
          masterId: actorId,
          gameSystemId: dto.gameSystemId,
          title: this.normalizeRequiredText(dto.title),
          description: this.normalizeOptionalText(dto.description),
          session: {
            create: {
              campaignId: null,
              title: this.normalizeOptionalText(dto.session.title),
              scheduledAt,
            },
          },
        },
        include: oneShotPrivateDetails,
      });
    });
  }

  async findPublic(query: PaginationQueryDto) {
    const where: Prisma.OneShotWhereInput = {
      approvalStatus: ApprovalStatus.APPROVED,
      status: OneShotStatus.SCHEDULED,
    };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.oneShot.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: oneShotPublicDetails,
      }),
      this.prisma.oneShot.count({ where }),
    ]);

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

  async findOne(id: string, actorId: string) {
    const oneShot = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(oneShot.masterId, actorId);
    return oneShot;
  }

  async update(id: string, actorId: string, dto: UpdateOneShotDto) {
    const oneShot = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(oneShot.masterId, actorId);

    if (
      dto.gameSystemId !== undefined ||
      dto.session?.scheduledAt !== undefined
    ) {
      throw conflict(
        'ONE_SHOT_ADMIN_CORRECTION_REQUIRED',
        'Sistema e data exigem correção administrativa do one-shot',
      );
    }

    if (
      oneShot.status === OneShotStatus.CANCELLED ||
      oneShot.status === OneShotStatus.COMPLETED
    ) {
      throw conflict(
        'ONE_SHOT_CLOSED',
        'One-shots cancelados ou concluídos não podem ser alterados',
      );
    }

    if (!this.hasUpdate(dto)) {
      throw badRequest(
        'ONE_SHOT_UPDATE_EMPTY',
        'Informe ao menos um campo para atualizar',
      );
    }

    if (!oneShot.session) {
      throw conflict(
        'ONE_SHOT_WITHOUT_SESSION',
        'O one-shot não possui a sessão obrigatória',
      );
    }

    const sessionData = dto.session
      ? {
          ...(dto.session.title !== undefined
            ? { title: this.normalizeOptionalText(dto.session.title) }
            : {}),
        }
      : undefined;

    return this.prisma.$transaction(async (transaction) => {
      if (sessionData && Object.keys(sessionData).length > 0) {
        await transaction.session.update({
          where: { id: oneShot.session!.id },
          data: sessionData,
        });
      }

      return transaction.oneShot.update({
        where: { id },
        data: {
          ...(dto.title
            ? { title: this.normalizeRequiredText(dto.title) }
            : {}),
          ...(dto.description !== undefined
            ? { description: this.normalizeOptionalText(dto.description) }
            : {}),
          approvalStatus: ApprovalStatus.PENDING,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          ...(oneShot.status === OneShotStatus.SCHEDULED
            ? { status: OneShotStatus.DRAFT }
            : {}),
        },
        include: oneShotPrivateDetails,
      });
    });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const oneShot = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(oneShot.masterId, actorId);

    if (!oneShot.session) {
      throw conflict(
        'ONE_SHOT_WITHOUT_SESSION',
        'O one-shot não possui a sessão obrigatória',
      );
    }

    const hasHistory = Object.values(oneShot.session._count).some(
      (count) => count > 0,
    );

    if (oneShot.status !== OneShotStatus.DRAFT || hasHistory) {
      throw conflict(
        'ONE_SHOT_DELETE_NOT_ALLOWED',
        'Somente one-shots em rascunho e sem histórico podem ser removidos',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.session.delete({ where: { id: oneShot.session!.id } });
      await transaction.oneShot.delete({ where: { id } });
    });
  }

  async correct(id: string, actorId: string, dto: CorrectOneShotDto) {
    await this.actors.assertAdministrator(actorId);
    if (dto.gameSystemId === undefined && dto.scheduledAt === undefined) {
      throw badRequest(
        'ONE_SHOT_CORRECTION_EMPTY',
        'Informe sistema ou data para a correção administrativa',
      );
    }
    return this.rules.serializable(async (transaction) => {
      const oneShot = await this.getByIdOrThrow(id, transaction);
      if (
        oneShot.status === OneShotStatus.CANCELLED ||
        oneShot.status === OneShotStatus.COMPLETED
      ) {
        throw conflict(
          'ONE_SHOT_CLOSED',
          'One-shots cancelados ou concluídos não podem ser corrigidos',
        );
      }
      if (!oneShot.session) {
        throw conflict(
          'ONE_SHOT_WITHOUT_SESSION',
          'O one-shot não possui a sessão obrigatória',
        );
      }
      const gameSystemId = dto.gameSystemId ?? oneShot.gameSystemId;
      await this.actors.assertActiveGameSystem(gameSystemId);
      const scheduledAt = this.rules.parseOneShotDate(
        dto.scheduledAt ?? oneShot.session.scheduledAt.toISOString(),
      );
      await this.rules.assertOneShotCapacity(
        transaction,
        gameSystemId,
        scheduledAt,
        id,
      );
      await transaction.session.update({
        where: { id: oneShot.session.id },
        data: { scheduledAt },
      });
      return transaction.oneShot.update({
        where: { id },
        data: {
          gameSystemId,
          approvalStatus: ApprovalStatus.PENDING,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          ...(oneShot.status === OneShotStatus.SCHEDULED
            ? { status: OneShotStatus.DRAFT }
            : {}),
        },
        include: oneShotPrivateDetails,
      });
    });
  }

  async publish(id: string, actorId: string) {
    const oneShot = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(oneShot.masterId, actorId);

    if (oneShot.approvalStatus !== ApprovalStatus.APPROVED) {
      throw conflict(
        'ONE_SHOT_NOT_APPROVED',
        'O one-shot precisa ser aprovado antes da publicação',
      );
    }

    if (!oneShot.session || oneShot.session.scheduledAt <= new Date()) {
      throw conflict(
        'ONE_SHOT_DATE_INVALID',
        'O one-shot precisa possuir uma sessão futura para ser publicado',
      );
    }

    if (
      oneShot.status === OneShotStatus.CANCELLED ||
      oneShot.status === OneShotStatus.COMPLETED
    ) {
      throw conflict(
        'ONE_SHOT_CLOSED',
        'One-shots cancelados ou concluídos não podem ser publicados',
      );
    }

    return this.prisma.oneShot.update({
      where: { id },
      data: { status: OneShotStatus.SCHEDULED },
      include: oneShotPrivateDetails,
    });
  }

  async changeStatus(id: string, actorId: string, dto: ChangeOneShotStatusDto) {
    const oneShot = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(oneShot.masterId, actorId);

    if (oneShot.status !== OneShotStatus.SCHEDULED) {
      throw conflict(
        'ONE_SHOT_STATUS_TRANSITION_INVALID',
        `O one-shot não pode passar de ${oneShot.status} para ${dto.status}`,
      );
    }

    if (
      dto.status !== OneShotStatus.CANCELLED &&
      dto.status !== OneShotStatus.COMPLETED
    ) {
      throw badRequest(
        'ONE_SHOT_STATUS_INVALID',
        'Um one-shot publicado pode apenas ser cancelado ou concluído',
      );
    }

    const cancellationReason = this.normalizeOptionalText(dto.reason);
    if (dto.status === OneShotStatus.CANCELLED && !cancellationReason) {
      throw badRequest(
        'CANCELLATION_REASON_REQUIRED',
        'Informe o motivo do cancelamento',
      );
    }

    if (!oneShot.session) {
      throw conflict(
        'ONE_SHOT_WITHOUT_SESSION',
        'O one-shot não possui a sessão obrigatória',
      );
    }

    if (
      dto.status === OneShotStatus.COMPLETED &&
      oneShot.session.scheduledAt > new Date()
    ) {
      throw conflict(
        'ONE_SHOT_NOT_STARTED',
        'Um one-shot futuro não pode ser concluído',
      );
    }

    const sessionStatus =
      dto.status === OneShotStatus.CANCELLED
        ? SessionStatus.CANCELLED
        : SessionStatus.COMPLETED;

    return this.prisma.$transaction(async (transaction) => {
      await transaction.session.update({
        where: { id: oneShot.session!.id },
        data: {
          status: sessionStatus,
          cancelledAt:
            sessionStatus === SessionStatus.CANCELLED ? new Date() : null,
          cancellationReason:
            sessionStatus === SessionStatus.CANCELLED
              ? cancellationReason
              : null,
        },
      });

      return transaction.oneShot.update({
        where: { id },
        data: { status: dto.status },
        include: oneShotPrivateDetails,
      });
    });
  }

  async review(id: string, reviewerId: string, dto: ReviewOneShotDto) {
    await this.actors.assertAdministrator(reviewerId);
    const oneShot = await this.getByIdOrThrow(id);
    const note = this.normalizeOptionalText(dto.note);

    if (
      dto.decision !== ApprovalStatus.APPROVED &&
      dto.decision !== ApprovalStatus.REJECTED
    ) {
      throw badRequest(
        'APPROVAL_DECISION_INVALID',
        'A decisão deve aprovar ou rejeitar o one-shot',
      );
    }

    if (dto.decision === ApprovalStatus.REJECTED && !note) {
      throw badRequest('REVIEW_NOTE_REQUIRED', 'Informe o motivo da rejeição');
    }

    if (
      oneShot.status === OneShotStatus.CANCELLED ||
      oneShot.status === OneShotStatus.COMPLETED
    ) {
      throw conflict(
        'ONE_SHOT_CLOSED',
        'One-shots cancelados ou concluídos não podem ser revisados',
      );
    }

    return this.prisma.oneShot.update({
      where: { id },
      data: {
        approvalStatus: dto.decision,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
        ...(dto.decision === ApprovalStatus.REJECTED &&
        oneShot.status === OneShotStatus.SCHEDULED
          ? { status: OneShotStatus.DRAFT }
          : {}),
      },
      include: oneShotPrivateDetails,
    });
  }

  private async getByIdOrThrow(
    id: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const oneShot = await client.oneShot.findUnique({
      where: { id },
      include: oneShotPrivateDetails,
    });

    if (!oneShot) {
      throw notFound('ONE_SHOT_NOT_FOUND', 'One-shot não encontrado');
    }

    return oneShot;
  }

  private hasUpdate(dto: UpdateOneShotDto): boolean {
    if (
      dto.gameSystemId !== undefined ||
      dto.title !== undefined ||
      dto.description !== undefined
    ) {
      return true;
    }

    return Boolean(
      dto.session &&
      (dto.session.title !== undefined ||
        dto.session.scheduledAt !== undefined),
    );
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequiredText(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw badRequest(
        'ONE_SHOT_TITLE_REQUIRED',
        'O título do one-shot é obrigatório',
      );
    }

    return normalized;
  }
}
