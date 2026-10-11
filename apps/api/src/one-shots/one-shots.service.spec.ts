import {
  ApprovalStatus,
  OneShotStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { OneShotsService } from './one-shots.service';

describe('OneShotsService', () => {
  type RepositoryMethod = (args: unknown) => Promise<unknown>;
  type TransactionRunner = (operation: unknown) => Promise<unknown>;

  const oneShotRepository = {
    create: jest.fn<RepositoryMethod>(),
    findUnique: jest.fn<RepositoryMethod>(),
    update: jest.fn<RepositoryMethod>(),
    delete: jest.fn<RepositoryMethod>(),
    findMany: jest.fn<RepositoryMethod>(),
    count: jest.fn<RepositoryMethod>(),
  };
  const runTransaction = jest.fn<TransactionRunner>();
  const prisma = {
    oneShot: oneShotRepository,
    $transaction: runTransaction,
  } as unknown as PrismaService;
  const actorMethods = {
    assertMaster: jest.fn<(userId: string) => Promise<void>>(),
    assertAdministrator: jest.fn<(userId: string) => Promise<void>>(),
    assertCanManage:
      jest.fn<(ownerId: string, actorId: string) => Promise<void>>(),
    assertActiveGameSystem: jest.fn<(systemId: string) => Promise<void>>(),
  };
  const service = new OneShotsService(
    prisma,
    actorMethods as unknown as TableActorsService,
  );

  const futureDate = new Date(Date.now() + 86_400_000);
  const oneShot = {
    id: 'one-shot-1',
    masterId: 'master-1',
    gameSystemId: 'system-1',
    title: 'A Torre Perdida',
    description: null,
    status: OneShotStatus.DRAFT,
    approvalStatus: ApprovalStatus.PENDING,
    reviewedById: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    master: { id: 'master-1', profile: { displayName: 'Mestre' } },
    gameSystem: { id: 'system-1', code: 'dnd5e', name: 'D&D 5e' },
    session: {
      id: 'session-1',
      campaignId: null,
      oneShotId: 'one-shot-1',
      title: null,
      scheduledAt: futureDate,
      status: SessionStatus.SCHEDULED,
      cancelledAt: null,
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: {
        participants: 0,
        feedbacks: 0,
        reports: 0,
        sanctionScopes: 0,
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    actorMethods.assertMaster.mockResolvedValue();
    actorMethods.assertAdministrator.mockResolvedValue();
    actorMethods.assertCanManage.mockResolvedValue();
    actorMethods.assertActiveGameSystem.mockResolvedValue();
  });

  it('creates the one-shot and its only session atomically', async () => {
    oneShotRepository.create.mockResolvedValue(oneShot);

    await service.create('master-1', {
      gameSystemId: 'system-1',
      title: ' A Torre Perdida ',
      session: { scheduledAt: futureDate.toISOString() },
    });

    const createCalls = oneShotRepository.create.mock.calls as unknown[][];
    const createInput = createCalls[0]?.[0] as {
      data: {
        masterId: string;
        title: string;
        session: { create: Record<string, unknown> };
      };
    };
    expect(createInput.data.masterId).toBe('master-1');
    expect(createInput.data.title).toBe('A Torre Perdida');
    expect(createInput.data.session.create).toMatchObject({
      campaignId: null,
      scheduledAt: futureDate,
    });
  });

  it('does not publish a one-shot before approval', async () => {
    oneShotRepository.findUnique.mockResolvedValue(oneShot);

    await expect(
      service.publish('one-shot-1', 'master-1'),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_NOT_APPROVED' },
    });
  });

  it('synchronizes one-shot and session cancellation', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      status: OneShotStatus.SCHEDULED,
      approvalStatus: ApprovalStatus.APPROVED,
    });

    const transaction = {
      session: { update: jest.fn() },
      oneShot: { update: jest.fn().mockResolvedValue(oneShot) },
    };
    runTransaction.mockImplementation(async (operation: unknown) =>
      (operation as (client: typeof transaction) => Promise<unknown>)(
        transaction,
      ),
    );

    await service.changeStatus('one-shot-1', 'master-1', {
      status: OneShotStatus.CANCELLED,
      reason: 'Indisponibilidade do mestre',
    });

    const sessionCalls = transaction.session.update.mock.calls as unknown[][];
    const sessionUpdate = sessionCalls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(sessionUpdate.where).toEqual({ id: 'session-1' });
    expect(sessionUpdate.data).toMatchObject({
      status: SessionStatus.CANCELLED,
      cancellationReason: 'Indisponibilidade do mestre',
    });

    const oneShotCalls = transaction.oneShot.update.mock.calls as unknown[][];
    const oneShotUpdate = oneShotCalls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(oneShotUpdate.data).toEqual({ status: OneShotStatus.CANCELLED });
  });

  it('preserves one-shots whose session already has history', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      session: {
        ...oneShot.session,
        _count: {
          participants: 1,
          feedbacks: 0,
          reports: 0,
          sanctionScopes: 0,
        },
      },
    });

    await expect(
      service.remove('one-shot-1', 'master-1'),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_DELETE_NOT_ALLOWED' },
    });
  });
});
