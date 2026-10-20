import {
  ApprovalStatus,
  CampaignStatus,
  OneShotStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { SessionsService } from './sessions.service';

describe('SessionsService', () => {
  type RepositoryMethod = (args: unknown) => Promise<unknown>;
  type TransactionRunner = (operation: unknown) => Promise<unknown>;

  const sessionRepository = {
    create: jest.fn<RepositoryMethod>(),
    findUnique: jest.fn<RepositoryMethod>(),
    findMany: jest.fn<RepositoryMethod>(),
    update: jest.fn<RepositoryMethod>(),
    delete: jest.fn<RepositoryMethod>(),
  };
  const campaignRepository = { findUnique: jest.fn<RepositoryMethod>() };
  const runTransaction = jest.fn<TransactionRunner>();
  const oneShotRepository = { update: jest.fn<RepositoryMethod>() };
  const prisma = {
    session: sessionRepository,
    campaign: campaignRepository,
    oneShot: oneShotRepository,
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const actorMethods = {
    assertCanManage:
      jest.fn<(ownerId: string, actorId: string) => Promise<void>>(),
  };
  const service = new SessionsService(
    prisma,
    actorMethods as unknown as TableActorsService,
  );

  const futureDate = new Date(Date.now() + 86_400_000);
  const pastDate = new Date(Date.now() - 86_400_000);
  const campaignSession = {
    id: 'session-1',
    campaignId: 'campaign-1',
    oneShotId: null,
    title: 'Sessão 1',
    scheduledAt: futureDate,
    status: SessionStatus.SCHEDULED,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    campaign: {
      id: 'campaign-1',
      title: 'Campanha',
      masterId: 'master-1',
      status: CampaignStatus.DRAFT,
      approvalStatus: ApprovalStatus.PENDING,
    },
    oneShot: null,
    _count: { participants: 0, feedbacks: 0, reports: 0, sanctionScopes: 0 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actorMethods.assertCanManage.mockResolvedValue();
  });

  it('creates a session linked only to its campaign', async () => {
    campaignRepository.findUnique.mockResolvedValue({
      masterId: 'master-1',
      status: CampaignStatus.DRAFT,
    });
    sessionRepository.create.mockResolvedValue(campaignSession);

    await service.createForCampaign('campaign-1', 'master-1', {
      title: ' Abertura ',
      scheduledAt: futureDate.toISOString(),
    });

    const createCalls = sessionRepository.create.mock.calls as unknown[][];
    const createInput = createCalls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(createInput.data).toMatchObject({
      campaignId: 'campaign-1',
      oneShotId: null,
      title: 'Abertura',
    });
  });

  it.each([
    { title: 'Novo título' },
    { scheduledAt: futureDate.toISOString() },
  ])(
    'blocks a direct one-shot session update: %j without writes',
    async (dto) => {
      sessionRepository.findUnique.mockResolvedValue({
        ...campaignSession,
        campaignId: null,
        campaign: null,
        oneShotId: 'one-shot-1',
        oneShot: {
          id: 'one-shot-1',
          title: 'One-shot',
          masterId: 'master-1',
          status: OneShotStatus.SCHEDULED,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      });
      await expect(
        service.update('session-1', 'master-1', dto),
      ).rejects.toMatchObject({
        response: { code: 'ONE_SHOT_SESSION_MANAGED_BY_ONE_SHOT' },
      });
      expect(sessionRepository.update).not.toHaveBeenCalled();
      expect(oneShotRepository.update).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([SessionStatus.CANCELLED, SessionStatus.COMPLETED])(
    'blocks direct one-shot session status %s without writes',
    async (status) => {
      const oneShotSession = {
        ...campaignSession,
        campaignId: null,
        oneShotId: 'one-shot-1',
        scheduledAt: pastDate,
        campaign: null,
        oneShot: {
          id: 'one-shot-1',
          title: 'One-shot',
          masterId: 'master-1',
          status: OneShotStatus.SCHEDULED,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      };
      sessionRepository.findUnique.mockResolvedValue(oneShotSession);

      await expect(
        service.changeStatus('session-1', 'master-1', {
          status,
          reason: 'Cancelamento',
        }),
      ).rejects.toMatchObject({
        response: { code: 'ONE_SHOT_SESSION_MANAGED_BY_ONE_SHOT' },
      });
      expect(sessionRepository.update).not.toHaveBeenCalled();
      expect(oneShotRepository.update).not.toHaveBeenCalled();
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );

  it('updates a campaign session normally', async () => {
    sessionRepository.findUnique.mockResolvedValue(campaignSession);
    await service.update('session-1', 'master-1', {
      title: ' Novo título ',
      scheduledAt: futureDate.toISOString(),
    });
    expect(sessionRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1' },
        data: { title: 'Novo título', scheduledAt: futureDate },
      }),
    );
  });

  it.each([SessionStatus.CANCELLED, SessionStatus.COMPLETED])(
    'changes campaign session status to %s normally',
    async (status) => {
      sessionRepository.findUnique.mockResolvedValue({
        ...campaignSession,
        scheduledAt: pastDate,
      });
      await service.changeStatus('session-1', 'master-1', {
        status,
        reason: 'Motivo',
      });
      expect(sessionRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: expect.objectContaining({ status }),
        }),
      );
      expect(runTransaction).not.toHaveBeenCalled();
    },
  );

  it('does not delete the mandatory session of a one-shot', async () => {
    sessionRepository.findUnique.mockResolvedValue({
      ...campaignSession,
      campaignId: null,
      oneShotId: 'one-shot-1',
      campaign: null,
      oneShot: {
        id: 'one-shot-1',
        title: 'One-shot',
        masterId: 'master-1',
        status: OneShotStatus.DRAFT,
        approvalStatus: ApprovalStatus.PENDING,
      },
    });

    await expect(service.remove('session-1', 'master-1')).rejects.toMatchObject(
      {
        response: { code: 'ONE_SHOT_SESSION_DELETE_NOT_ALLOWED' },
      },
    );
    expect(sessionRepository.delete).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('does not complete a future session', async () => {
    sessionRepository.findUnique.mockResolvedValue(campaignSession);

    await expect(
      service.changeStatus('session-1', 'master-1', {
        status: SessionStatus.COMPLETED,
      }),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_NOT_STARTED' },
    });
  });
});
