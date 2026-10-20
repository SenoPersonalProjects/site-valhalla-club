import { Injectable } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ApprovalStatus, CampaignStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { badRequest, conflict, notFound } from '../tables/table-domain.errors';
import { ChangeCampaignStatusDto } from './dto/change-campaign-status.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ReviewCampaignDto } from './dto/review-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

const campaignDetails = {
  master: {
    select: {
      id: true,
      profile: { select: { displayName: true } },
    },
  },
  gameSystem: { select: { id: true, code: true, name: true } },
  sessions: {
    orderBy: { scheduledAt: 'asc' as const },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      status: true,
    },
  },
} satisfies Prisma.CampaignInclude;

const campaignPublicDetails = {
  id: true,
  title: true,
  description: true,
  status: true,
  master: { select: { profile: { select: { displayName: true } } } },
  gameSystem: { select: { id: true, code: true, name: true } },
  sessions: {
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
    select: { id: true, title: true, scheduledAt: true, status: true },
  },
} satisfies Prisma.CampaignSelect;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly actors: TableActorsService,
  ) {}

  async create(actorId: string, dto: CreateCampaignDto) {
    await Promise.all([
      this.actors.assertMaster(actorId),
      this.actors.assertActiveGameSystem(dto.gameSystemId),
    ]);

    return this.prisma.campaign.create({
      data: {
        masterId: actorId,
        gameSystemId: dto.gameSystemId,
        title: this.normalizeRequiredText(dto.title, 'CAMPAIGN_TITLE_REQUIRED'),
        description: this.normalizeOptionalText(dto.description),
      },
      include: campaignDetails,
    });
  }

  async findPublic(query: PaginationQueryDto) {
    const where: Prisma.CampaignWhereInput = {
      approvalStatus: ApprovalStatus.APPROVED,
      status: CampaignStatus.ACTIVE,
    };
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.campaign.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: campaignPublicDetails,
      }),
      this.prisma.campaign.count({ where }),
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
    const campaign = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(campaign.masterId, actorId);
    return campaign;
  }

  async update(id: string, actorId: string, dto: UpdateCampaignDto) {
    const campaign = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(campaign.masterId, actorId);

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw conflict(
        'CAMPAIGN_ARCHIVED',
        'Campanhas arquivadas não podem ser alteradas',
      );
    }

    if (!this.hasUpdate(dto)) {
      throw badRequest(
        'CAMPAIGN_UPDATE_EMPTY',
        'Informe ao menos um campo para atualizar',
      );
    }

    if (dto.gameSystemId) {
      await this.actors.assertActiveGameSystem(dto.gameSystemId);
    }

    const data: Prisma.CampaignUncheckedUpdateInput = {
      ...(dto.gameSystemId ? { gameSystemId: dto.gameSystemId } : {}),
      ...(dto.title
        ? {
            title: this.normalizeRequiredText(
              dto.title,
              'CAMPAIGN_TITLE_REQUIRED',
            ),
          }
        : {}),
      ...(dto.description !== undefined
        ? { description: this.normalizeOptionalText(dto.description) }
        : {}),
      approvalStatus: ApprovalStatus.PENDING,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      ...(campaign.status === CampaignStatus.ACTIVE
        ? { status: CampaignStatus.INACTIVE }
        : {}),
    };

    return this.prisma.campaign.update({
      where: { id },
      data,
      include: campaignDetails,
    });
  }

  async remove(id: string, actorId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      select: {
        masterId: true,
        status: true,
        _count: { select: { sessions: true, sanctionScopes: true } },
      },
    });

    if (!campaign) {
      throw notFound('CAMPAIGN_NOT_FOUND', 'Campanha não encontrada');
    }

    await this.actors.assertCanManage(campaign.masterId, actorId);

    if (
      campaign.status !== CampaignStatus.DRAFT ||
      campaign._count.sessions > 0 ||
      campaign._count.sanctionScopes > 0
    ) {
      throw conflict(
        'CAMPAIGN_DELETE_NOT_ALLOWED',
        'Somente campanhas em rascunho e sem histórico podem ser removidas; arquive a campanha',
      );
    }

    await this.prisma.campaign.delete({ where: { id } });
  }

  async publish(id: string, actorId: string) {
    const campaign = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(campaign.masterId, actorId);

    if (campaign.approvalStatus !== ApprovalStatus.APPROVED) {
      throw conflict(
        'CAMPAIGN_NOT_APPROVED',
        'A campanha precisa ser aprovada antes da publicação',
      );
    }

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw conflict(
        'CAMPAIGN_ARCHIVED',
        'Uma campanha arquivada não pode ser publicada',
      );
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.ACTIVE },
      include: campaignDetails,
    });
  }

  async changeStatus(
    id: string,
    actorId: string,
    dto: ChangeCampaignStatusDto,
  ) {
    const campaign = await this.getByIdOrThrow(id);
    await this.actors.assertCanManage(campaign.masterId, actorId);

    if (dto.status === CampaignStatus.ACTIVE) {
      throw badRequest(
        'CAMPAIGN_USE_PUBLISH_ENDPOINT',
        'Use o endpoint de publicação para ativar a campanha',
      );
    }

    const allowedTargets = this.allowedStatusTargets(campaign.status);
    if (!allowedTargets.includes(dto.status)) {
      throw conflict(
        'CAMPAIGN_STATUS_TRANSITION_INVALID',
        `A campanha não pode passar de ${campaign.status} para ${dto.status}`,
      );
    }

    return this.prisma.campaign.update({
      where: { id },
      data: { status: dto.status },
      include: campaignDetails,
    });
  }

  async review(id: string, reviewerId: string, dto: ReviewCampaignDto) {
    await this.actors.assertAdministrator(reviewerId);
    const campaign = await this.getByIdOrThrow(id);
    const note = this.normalizeOptionalText(dto.note);

    if (
      dto.decision !== ApprovalStatus.APPROVED &&
      dto.decision !== ApprovalStatus.REJECTED
    ) {
      throw badRequest(
        'APPROVAL_DECISION_INVALID',
        'A decisão deve aprovar ou rejeitar a campanha',
      );
    }

    if (dto.decision === ApprovalStatus.REJECTED && !note) {
      throw badRequest('REVIEW_NOTE_REQUIRED', 'Informe o motivo da rejeição');
    }

    if (campaign.status === CampaignStatus.ARCHIVED) {
      throw conflict(
        'CAMPAIGN_ARCHIVED',
        'Campanhas arquivadas não podem ser revisadas',
      );
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        approvalStatus: dto.decision,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note,
        ...(dto.decision === ApprovalStatus.REJECTED &&
        campaign.status === CampaignStatus.ACTIVE
          ? { status: CampaignStatus.INACTIVE }
          : {}),
      },
      include: campaignDetails,
    });
  }

  private async getByIdOrThrow(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: campaignDetails,
    });

    if (!campaign) {
      throw notFound('CAMPAIGN_NOT_FOUND', 'Campanha não encontrada');
    }

    return campaign;
  }

  private allowedStatusTargets(status: CampaignStatus): CampaignStatus[] {
    const transitions: Record<CampaignStatus, CampaignStatus[]> = {
      [CampaignStatus.DRAFT]: [CampaignStatus.ARCHIVED],
      [CampaignStatus.ACTIVE]: [
        CampaignStatus.INACTIVE,
        CampaignStatus.ARCHIVED,
      ],
      [CampaignStatus.INACTIVE]: [CampaignStatus.ARCHIVED],
      [CampaignStatus.ARCHIVED]: [],
    };

    return transitions[status];
  }

  private hasUpdate(dto: UpdateCampaignDto): boolean {
    return (
      dto.gameSystemId !== undefined ||
      dto.title !== undefined ||
      dto.description !== undefined
    );
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequiredText(value: string, code: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw badRequest(code, 'O título da campanha é obrigatório');
    }

    return normalized;
  }
}
