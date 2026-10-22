import { ApprovalStatus, CampaignStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { CampaignsService } from './campaigns.service';
import { TableRulesService } from '../tables/table-rules.service';

describe('CampaignsService', () => {
  type RepositoryMethod = (args: unknown) => Promise<unknown>;

  const campaignRepository = {
    create: jest.fn<RepositoryMethod>(),
    findUnique: jest.fn<RepositoryMethod>(),
    update: jest.fn<RepositoryMethod>(),
    delete: jest.fn<RepositoryMethod>(),
    findMany: jest.fn<RepositoryMethod>(),
    count: jest.fn<RepositoryMethod>(),
  };
  const runTransaction = jest.fn();
  const prisma = {
    campaign: campaignRepository,
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const actorMethods = {
    assertMaster: jest.fn<(userId: string) => Promise<void>>(),
    assertAdministrator: jest.fn<(userId: string) => Promise<void>>(),
    assertCanManage:
      jest.fn<(ownerId: string, actorId: string) => Promise<void>>(),
    assertActiveGameSystem: jest.fn<(systemId: string) => Promise<void>>(),
  };

  const service = new CampaignsService(
    prisma,
    actorMethods as unknown as TableActorsService,
    new TableRulesService(prisma),
  );

  const campaign = {
    id: 'campaign-1',
    masterId: 'master-1',
    gameSystemId: 'system-1',
    title: 'Crônicas do Norte',
    description: null,
    status: CampaignStatus.DRAFT,
    approvalStatus: ApprovalStatus.PENDING,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    master: { id: 'master-1', profile: { displayName: 'Mestre' } },
    gameSystem: { id: 'system-1', code: 'dnd5e', name: 'D&D 5e' },
    sessions: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    runTransaction.mockImplementation(
      async (operation: (client: PrismaService) => Promise<unknown>) =>
        operation(prisma),
    );
    campaignRepository.count.mockResolvedValue(0);
    actorMethods.assertMaster.mockResolvedValue();
    actorMethods.assertAdministrator.mockResolvedValue();
    actorMethods.assertCanManage.mockResolvedValue();
    actorMethods.assertActiveGameSystem.mockResolvedValue();
  });

  it('creates a draft campaign linked to the acting master', async () => {
    campaignRepository.create.mockResolvedValue(campaign);

    await service.create('master-1', {
      gameSystemId: 'system-1',
      title: '  Crônicas do Norte  ',
      description: '  Campanha semanal  ',
    });

    expect(actorMethods.assertMaster).toHaveBeenCalledWith('master-1');
    expect(actorMethods.assertActiveGameSystem).toHaveBeenCalledWith(
      'system-1',
    );

    const createCalls = campaignRepository.create.mock.calls as unknown[][];
    const createInput = createCalls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createInput.data).toMatchObject({
      masterId: 'master-1',
      title: 'Crônicas do Norte',
      description: 'Campanha semanal',
    });
    expect(campaignRepository.count).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it.each([0, 1])('publishes with %i other active campaigns', async (count) => {
    campaignRepository.findUnique.mockResolvedValue({
      ...campaign,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    campaignRepository.count.mockResolvedValue(count);
    await service.publish('campaign-1', 'master-1');
    expect(campaignRepository.count).toHaveBeenCalledWith({
      where: {
        masterId: 'master-1',
        status: CampaignStatus.ACTIVE,
        id: { not: 'campaign-1' },
      },
    });
    expect(campaignRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: CampaignStatus.ACTIVE } }),
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it.each(['master-1', 'admin-1'])(
    'rejects a third active campaign even for %s',
    async (actorId) => {
      campaignRepository.findUnique.mockResolvedValue({
        ...campaign,
        approvalStatus: ApprovalStatus.APPROVED,
      });
      campaignRepository.count.mockResolvedValue(2);
      await expect(
        service.publish('campaign-1', actorId),
      ).rejects.toMatchObject({
        response: { code: 'CAMPAIGN_ACTIVE_LIMIT_REACHED' },
      });
      expect(campaignRepository.update).not.toHaveBeenCalled();
    },
  );

  it('republishes ACTIVE idempotently without renewing the inactivity baseline or counting quota again', async () => {
    const active = {
      ...campaign,
      status: CampaignStatus.ACTIVE,
      approvalStatus: ApprovalStatus.APPROVED,
      updatedAt: new Date('2026-09-01T12:00:00Z'),
    };
    campaignRepository.findUnique.mockResolvedValue(active);
    campaignRepository.count.mockResolvedValue(2);
    expect(await service.publish('campaign-1', 'master-1')).toBe(active);
    expect(active.updatedAt).toEqual(new Date('2026-09-01T12:00:00Z'));
    expect(actorMethods.assertCanManage).toHaveBeenCalledWith(
      'master-1',
      'master-1',
      prisma,
    );
    expect(campaignRepository.count).not.toHaveBeenCalled();
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('still checks authorization before an ACTIVE publication no-op', async () => {
    campaignRepository.findUnique.mockResolvedValue({
      ...campaign,
      status: CampaignStatus.ACTIVE,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    actorMethods.assertCanManage.mockRejectedValueOnce(new Error('denied'));
    await expect(service.publish('campaign-1', 'other-user')).rejects.toThrow(
      'denied',
    );
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2])(
    'keeps the active quota for INACTIVE publication with %i other ACTIVE campaigns',
    async (count) => {
      campaignRepository.findUnique.mockResolvedValue({
        ...campaign,
        status: CampaignStatus.INACTIVE,
        approvalStatus: ApprovalStatus.APPROVED,
      });
      campaignRepository.count.mockResolvedValue(count);
      if (count < 2) {
        await service.publish('campaign-1', 'master-1');
        expect(campaignRepository.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: { status: CampaignStatus.ACTIVE } }),
        );
      } else {
        await expect(
          service.publish('campaign-1', 'master-1'),
        ).rejects.toMatchObject({
          response: { code: 'CAMPAIGN_ACTIVE_LIMIT_REACHED' },
        });
        expect(campaignRepository.update).not.toHaveBeenCalled();
      }
      expect(campaignRepository.count).toHaveBeenCalledWith({
        where: {
          masterId: 'master-1',
          status: CampaignStatus.ACTIVE,
          id: { not: 'campaign-1' },
        },
      });
    },
  );

  it('still checks approval before an ACTIVE publication no-op', async () => {
    campaignRepository.findUnique.mockResolvedValue({
      ...campaign,
      status: CampaignStatus.ACTIVE,
    });
    await expect(
      service.publish('campaign-1', 'master-1'),
    ).rejects.toMatchObject({ response: { code: 'CAMPAIGN_NOT_APPROVED' } });
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Aprovado', 'Outra nota'])(
    'does not renew ACTIVE + APPROVED timestamps on repeated approval with note %s',
    async (note) => {
      const active = {
        ...campaign,
        status: CampaignStatus.ACTIVE,
        approvalStatus: ApprovalStatus.APPROVED,
        updatedAt: new Date('2026-09-01T12:00:00Z'),
        reviewedAt: new Date('2026-08-31T12:00:00Z'),
        reviewedById: 'original-admin',
        reviewNote: 'Aprovado',
      };
      campaignRepository.findUnique.mockResolvedValue(active);
      const result = await service.review('campaign-1', 'admin-1', {
        decision: ApprovalStatus.APPROVED,
        note,
      });
      expect(actorMethods.assertAdministrator).toHaveBeenCalledWith(
        'admin-1',
        prisma,
      );
      expect(result).toBe(active);
      expect(result.updatedAt).toEqual(new Date('2026-09-01T12:00:00Z'));
      expect(result.reviewedById).toBe('original-admin');
      expect(result.reviewedAt).toEqual(new Date('2026-08-31T12:00:00Z'));
      expect(result.reviewNote).toBe('Aprovado');
      expect(campaignRepository.update).not.toHaveBeenCalled();
    },
  );

  it('still checks administrative access before a repeated approval no-op', async () => {
    actorMethods.assertAdministrator.mockRejectedValueOnce(new Error('denied'));
    await expect(
      service.review('campaign-1', 'master-1', {
        decision: ApprovalStatus.APPROVED,
      }),
    ).rejects.toThrow('denied');
    expect(campaignRepository.findUnique).not.toHaveBeenCalled();
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('still rejects and unpublishes an ACTIVE approved campaign', async () => {
    campaignRepository.findUnique.mockResolvedValue({
      ...campaign,
      status: CampaignStatus.ACTIVE,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    await service.review('campaign-1', 'admin-1', {
      decision: ApprovalStatus.REJECTED,
      note: 'Correção necessária',
    });
    expect(campaignRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: CampaignStatus.INACTIVE,
          approvalStatus: ApprovalStatus.REJECTED,
        }),
      }),
    );
  });

  it('ignores draft, inactive and archived campaigns in the active quota', async () => {
    const statuses = [
      CampaignStatus.ACTIVE,
      CampaignStatus.DRAFT,
      CampaignStatus.DRAFT,
      CampaignStatus.INACTIVE,
      CampaignStatus.ARCHIVED,
    ];
    campaignRepository.findUnique.mockResolvedValue({
      ...campaign,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    campaignRepository.count.mockImplementation(async (input: unknown) => {
      const { where } = input as { where: { status: string } };
      return statuses.filter((status) => status === where.status).length;
    });
    await service.publish('campaign-1', 'master-1');
    expect(campaignRepository.update).toHaveBeenCalled();
  });

  it('queries only public fields with deterministic pagination', async () => {
    campaignRepository.findMany.mockResolvedValue([]);
    campaignRepository.count.mockResolvedValue(21);
    runTransaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    const result = await service.findPublic({ page: 2, limit: 10 });
    expect(campaignRepository.findMany).toHaveBeenCalledWith({
      where: {
        approvalStatus: ApprovalStatus.APPROVED,
        status: CampaignStatus.ACTIVE,
      },
      skip: 10,
      take: 10,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
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
      },
    });
    expect(campaignRepository.count).toHaveBeenCalledWith({
      where: {
        approvalStatus: ApprovalStatus.APPROVED,
        status: CampaignStatus.ACTIVE,
      },
    });
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 21, pages: 3 });
  });

  it('returns an approved active campaign to draft review after editing', async () => {
    campaignRepository.findUnique.mockResolvedValue({
      ...campaign,
      status: CampaignStatus.ACTIVE,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    campaignRepository.update.mockResolvedValue(campaign);

    await service.update('campaign-1', 'master-1', {
      title: 'Novo título',
    });

    const updateCalls = campaignRepository.update.mock.calls as unknown[][];
    const updateInput = updateCalls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(updateInput.data).toMatchObject({
      title: 'Novo título',
      status: CampaignStatus.INACTIVE,
      approvalStatus: ApprovalStatus.PENDING,
      reviewedById: null,
    });
  });

  it('does not publish a campaign before administrative approval', async () => {
    campaignRepository.findUnique.mockResolvedValue(campaign);

    await expect(
      service.publish('campaign-1', 'master-1'),
    ).rejects.toMatchObject({
      response: { code: 'CAMPAIGN_NOT_APPROVED' },
    });
    expect(campaignRepository.update).not.toHaveBeenCalled();
  });

  it('requires a reason when an administrator rejects a campaign', async () => {
    campaignRepository.findUnique.mockResolvedValue(campaign);

    await expect(
      service.review('campaign-1', 'admin-1', {
        decision: ApprovalStatus.REJECTED,
      }),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_NOTE_REQUIRED' },
    });
  });

  it('preserves campaigns that already have sessions', async () => {
    campaignRepository.findUnique.mockResolvedValue({
      masterId: 'master-1',
      status: CampaignStatus.DRAFT,
      _count: { sessions: 1, sanctionScopes: 0 },
    });

    await expect(
      service.remove('campaign-1', 'master-1'),
    ).rejects.toMatchObject({
      response: { code: 'CAMPAIGN_DELETE_NOT_ALLOWED' },
    });
    expect(campaignRepository.delete).not.toHaveBeenCalled();
  });
});
