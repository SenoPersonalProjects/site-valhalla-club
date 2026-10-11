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
  const prisma = {
    session: sessionRepository,
    campaign: campaignRepository,
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

  it('synchronizes a one-shot when its session is completed', async () => {
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

    const transaction = {
      oneShot: { update: jest.fn() },
      session: { update: jest.fn().mockResolvedValue(oneShotSession) },
    };
    runTransaction.mockImplementation(async (operation: unknown) =>
      (operation as (client: typeof transaction) => Promise<unknown>)(
        transaction,
      ),
    );

    await service.changeStatus('session-1', 'master-1', {
      status: SessionStatus.COMPLETED,
    });

    expect(transaction.oneShot.update).toHaveBeenCalledWith({
      where: { id: 'one-shot-1' },
      data: { status: OneShotStatus.COMPLETED },
    });
  });

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
