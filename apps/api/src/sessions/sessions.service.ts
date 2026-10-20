import { Injectable } from '@nestjs/common';
import { CampaignStatus, SessionStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { badRequest, conflict, notFound } from '../tables/table-domain.errors';
import { ChangeSessionStatusDto } from './dto/change-session-status.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

const sessionDetails = {
  campaign: {
    select: {
      id: true,
      title: true,
      masterId: true,
      status: true,
      approvalStatus: true,
    },
  },
  oneShot: {
    select: {
      id: true,
      title: true,
      masterId: true,
      status: true,
      approvalStatus: true,
    },
  },
  _count: {
    select: {
      participants: true,
      feedbacks: true,
      reports: true,
      sanctionScopes: true,
    },
  },
} satisfies Prisma.SessionInclude;

@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: TableActorsService,
  ) {}

  async createForCampaign(
    campaignId: string,
    actorId: string,
    dto: CreateSessionDto,
  ) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { masterId: true, status: true },
    });

    if (!campaign) {
      throw notFound('CAMPAIGN_NOT_FOUND', 'Campanha não encontrada');
    }

    await this.actors.assertCanManage(campaign.masterId, actorId);

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw conflict(
        'CAMPAIGN_ARCHIVED',
        'Não é possível adicionar sessões a uma campanha arquivada',
      );
    }

    const scheduledAt = this.parseFutureDate(dto.scheduledAt);

    return this.prisma.session.create({
      data: {
        campaignId,
        oneShotId: null,
        title: this.normalizeOptionalText(dto.title),
        scheduledAt,
      },
      include: sessionDetails,
    });
  }

  async findForCampaign(campaignId: string, actorId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { masterId: true },
    });

    if (!campaign) {
      throw notFound('CAMPAIGN_NOT_FOUND', 'Campanha não encontrada');
    }

    await this.actors.assertCanManage(campaign.masterId, actorId);

    return this.prisma.session.findMany({
      where: { campaignId },
      orderBy: { scheduledAt: 'asc' },
      include: sessionDetails,
    });
  }

  async findOne(id: string, actorId: string) {
    const session = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(this.ownerId(session), actorId);
    return session;
  }

  async update(id: string, actorId: string, dto: UpdateSessionDto) {
    const session = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(this.ownerId(session), actorId);
    this.assertCampaignSession(session);

    if (session.status !== SessionStatus.SCHEDULED) {
      throw conflict(
        'SESSION_CLOSED',
        'Somente sessões agendadas podem ser alteradas',
      );
    }

    if (dto.title === undefined && dto.scheduledAt === undefined) {
      throw badRequest(
        'SESSION_UPDATE_EMPTY',
        'Informe ao menos um campo para atualizar',
      );
    }

    return this.prisma.session.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? { title: this.normalizeOptionalText(dto.title) }
          : {}),
        ...(dto.scheduledAt
          ? { scheduledAt: this.parseFutureDate(dto.scheduledAt) }
          : {}),
      },
      include: sessionDetails,
    });
  }

  async changeStatus(id: string, actorId: string, dto: ChangeSessionStatusDto) {
    const session = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(this.ownerId(session), actorId);
    this.assertCampaignSession(session);

    if (session.status !== SessionStatus.SCHEDULED) {
      throw conflict(
        'SESSION_STATUS_TRANSITION_INVALID',
        `A sessão não pode passar de ${session.status} para ${dto.status}`,
      );
    }

    if (
      dto.status !== SessionStatus.CANCELLED &&
      dto.status !== SessionStatus.COMPLETED
    ) {
      throw badRequest(
        'SESSION_STATUS_INVALID',
        'Uma sessão agendada pode apenas ser cancelada ou concluída',
      );
    }

    const cancellationReason = this.normalizeOptionalText(dto.reason);
    if (dto.status === SessionStatus.CANCELLED && !cancellationReason) {
      throw badRequest(
        'CANCELLATION_REASON_REQUIRED',
        'Informe o motivo do cancelamento',
      );
    }

    if (
      dto.status === SessionStatus.COMPLETED &&
      session.scheduledAt > new Date()
    ) {
      throw conflict(
        'SESSION_NOT_STARTED',
        'Uma sessão futura não pode ser concluída',
      );
    }

    const sessionUpdate: Prisma.SessionUpdateInput = {
      status: dto.status,
      cancelledAt: dto.status === SessionStatus.CANCELLED ? new Date() : null,
      cancellationReason:
        dto.status === SessionStatus.CANCELLED ? cancellationReason : null,
    };

    return this.prisma.session.update({
      where: { id },
      data: sessionUpdate,
      include: sessionDetails,
    });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const session = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(this.ownerId(session), actorId);

    if (session.oneShotId) {
      throw conflict(
        'ONE_SHOT_SESSION_DELETE_NOT_ALLOWED',
        'A sessão de um one-shot só pode ser removida com o próprio one-shot',
      );
    }

    const hasHistory = Object.values(session._count).some((count) => count > 0);
    if (session.status !== SessionStatus.SCHEDULED || hasHistory) {
      throw conflict(
        'SESSION_DELETE_NOT_ALLOWED',
        'Somente sessões agendadas e sem histórico podem ser removidas',
      );
    }

    await this.prisma.session.delete({ where: { id } });
  }

  private assertCampaignSession(session: { oneShotId: string | null }): void {
    if (session.oneShotId) {
      throw conflict(
        'ONE_SHOT_SESSION_MANAGED_BY_ONE_SHOT',
        'A sessão deve ser alterada através do one-shot correspondente',
      );
    }
  }

  private async getByIdOrThrow(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: sessionDetails,
    });

    if (!session) {
      throw notFound('SESSION_NOT_FOUND', 'Sessão não encontrada');
    }

    return session;
  }

  private ownerId(
    session: Awaited<ReturnType<SessionsService['getByIdOrThrow']>>,
  ): string {
    const ownerId = session.campaign?.masterId ?? session.oneShot?.masterId;

    if (!ownerId) {
      throw conflict(
        'SESSION_WITHOUT_TABLE',
        'A sessão não está vinculada a uma campanha ou one-shot',
      );
    }

    return ownerId;
  }

  private parseFutureDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      throw badRequest(
        'SESSION_DATE_MUST_BE_FUTURE',
        'A data da sessão precisa estar no futuro',
      );
    }

    return date;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}
