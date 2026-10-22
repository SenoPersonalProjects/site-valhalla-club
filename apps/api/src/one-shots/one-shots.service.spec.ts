import {
  ApprovalStatus,
  OneShotStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from '../tables/table-actors.service';
import { OneShotsService } from './one-shots.service';
import {
  TableRulesService,
  TABLE_RULE_WINDOW_MS,
} from '../tables/table-rules.service';

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
  const sessionRepository = { update: jest.fn<RepositoryMethod>() };
  const prisma = {
    oneShot: oneShotRepository,
    session: sessionRepository,
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
    new TableRulesService(prisma),
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
    oneShotRepository.count.mockResolvedValue(0);
    runTransaction.mockImplementation(async (operation: unknown) =>
      (operation as (client: PrismaService) => Promise<unknown>)(prisma),
    );
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
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
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

  it('queries only public fields with deterministic pagination', async () => {
    oneShotRepository.findMany.mockResolvedValue([]);
    oneShotRepository.count.mockResolvedValue(21);
    runTransaction.mockImplementation(async (operations: unknown) =>
      Promise.all(operations as Promise<unknown>[]),
    );
    const result = await service.findPublic({ page: 2, limit: 10 });
    expect(oneShotRepository.findMany).toHaveBeenCalledWith({
      where: {
        approvalStatus: ApprovalStatus.APPROVED,
        status: OneShotStatus.SCHEDULED,
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
        session: {
          select: { id: true, title: true, scheduledAt: true, status: true },
        },
      },
    });
    expect(oneShotRepository.count).toHaveBeenCalledWith({
      where: {
        approvalStatus: ApprovalStatus.APPROVED,
        status: OneShotStatus.SCHEDULED,
      },
    });
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 21, pages: 3 });
  });

  it('updates session content and clears previous approval atomically', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      status: OneShotStatus.SCHEDULED,
      approvalStatus: ApprovalStatus.APPROVED,
      reviewedById: 'admin-1',
      reviewedAt: new Date(),
      reviewNote: 'Aprovado',
    });
    const transaction = {
      session: { update: jest.fn() },
      oneShot: {
        findUnique: oneShotRepository.findUnique,
        update: jest.fn().mockResolvedValue(oneShot),
      },
    };
    runTransaction.mockImplementation(async (operation: unknown) =>
      (operation as (client: typeof transaction) => Promise<unknown>)(
        transaction,
      ),
    );
    await service.update('one-shot-1', 'master-1', {
      session: {
        title: ' Novo título ',
      },
    });
    expect(transaction.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { title: 'Novo título' },
    });
    expect(transaction.oneShot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'one-shot-1' },
        data: {
          approvalStatus: ApprovalStatus.PENDING,
          status: OneShotStatus.DRAFT,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
        },
      }),
    );
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('synchronizes one-shot and session completion atomically', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      status: OneShotStatus.SCHEDULED,
      session: {
        ...oneShot.session,
        scheduledAt: new Date(Date.now() - 86_400_000),
      },
    });
    const transaction = {
      session: { update: jest.fn() },
      oneShot: {
        findUnique: oneShotRepository.findUnique,
        update: jest.fn().mockResolvedValue(oneShot),
      },
    };
    runTransaction.mockImplementation(async (operation: unknown) =>
      (operation as (client: typeof transaction) => Promise<unknown>)(
        transaction,
      ),
    );
    await service.changeStatus('one-shot-1', 'master-1', {
      status: OneShotStatus.COMPLETED,
    });
    expect(transaction.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: {
        status: SessionStatus.COMPLETED,
        cancelledAt: null,
        cancellationReason: null,
      },
    });
    expect(transaction.oneShot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'one-shot-1' },
        data: { status: OneShotStatus.COMPLETED },
      }),
    );
    expect(runTransaction).toHaveBeenCalledTimes(1);
  });

  it('synchronizes one-shot and session cancellation', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      status: OneShotStatus.SCHEDULED,
      approvalStatus: ApprovalStatus.APPROVED,
    });

    const transaction = {
      session: { update: jest.fn() },
      oneShot: {
        findUnique: oneShotRepository.findUnique,
        update: jest.fn().mockResolvedValue(oneShot),
      },
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

  it.each([0, 1, 2, 3, 4])(
    'allows creation with %i registered one-shots in the bucket',
    async (count) => {
      oneShotRepository.count.mockResolvedValue(count);
      await service.create('master-2', {
        gameSystemId: 'system-1',
        title: 'Nova mesa',
        session: { scheduledAt: futureDate.toISOString() },
      });
      expect(oneShotRepository.create).toHaveBeenCalled();
      const query = oneShotRepository.count.mock.calls[0][0];
      expect(query).toEqual({
        where: {
          gameSystemId: 'system-1',
          session: {
            is: {
              scheduledAt: new TableRulesService(prisma).oneShotMonth(
                futureDate,
              ),
            },
          },
        },
      });
      // Exact query has neither masterId nor status: all masters and all states count.
    },
  );

  it('rejects a sixth record without writing', async () => {
    oneShotRepository.count.mockResolvedValue(5);
    await expect(
      service.create('master-2', {
        gameSystemId: 'system-1',
        title: 'Sexta',
        session: { scheduledAt: futureDate.toISOString() },
      }),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_MONTHLY_LIMIT_REACHED' },
    });
    expect(oneShotRepository.create).not.toHaveBeenCalled();
  });

  it('rejects creation beyond 30 days before counting or writing', async () => {
    await expect(
      service.create('master-1', {
        gameSystemId: 'system-1',
        title: 'Distante',
        session: {
          scheduledAt: new Date(
            Date.now() + TABLE_RULE_WINDOW_MS + 60_000,
          ).toISOString(),
        },
      }),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_SCHEDULE_TOO_FAR' },
    });
    expect(oneShotRepository.count).not.toHaveBeenCalled();
    expect(oneShotRepository.create).not.toHaveBeenCalled();
  });

  it.each([
    { gameSystemId: 'system-2' },
    { session: { scheduledAt: futureDate.toISOString() } },
  ])('requires administrative correction for %j', async (dto) => {
    oneShotRepository.findUnique.mockResolvedValue(oneShot);
    await expect(
      service.update('one-shot-1', 'master-1', dto),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_ADMIN_CORRECTION_REQUIRED' },
    });
    expect(oneShotRepository.update).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('allows normal title and description updates and resets approval', async () => {
    oneShotRepository.findUnique.mockResolvedValue(oneShot);
    await service.update('one-shot-1', 'master-1', {
      title: ' Novo título ',
      description: 'Descrição',
    });
    expect(oneShotRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Novo título',
          description: 'Descrição',
          approvalStatus: ApprovalStatus.PENDING,
        }),
      }),
    );
  });

  it('corrects the aggregate atomically, excluding itself and removing approval/publication', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      status: OneShotStatus.SCHEDULED,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    oneShotRepository.count.mockResolvedValue(4);
    await service.correct('one-shot-1', 'admin-1', {
      gameSystemId: 'system-2',
      scheduledAt: futureDate.toISOString(),
    });
    expect(actorMethods.assertAdministrator).toHaveBeenCalledWith(
      'admin-1',
      prisma,
    );
    expect(actorMethods.assertActiveGameSystem).toHaveBeenCalledWith(
      'system-2',
      prisma,
    );
    expect(oneShotRepository.count).toHaveBeenCalledWith({
      where: {
        gameSystemId: 'system-2',
        id: { not: 'one-shot-1' },
        session: {
          is: {
            scheduledAt: new TableRulesService(prisma).oneShotMonth(futureDate),
          },
        },
      },
    });
    expect(sessionRepository.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { scheduledAt: futureDate },
    });
    expect(oneShotRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          gameSystemId: 'system-2',
          approvalStatus: ApprovalStatus.PENDING,
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          status: OneShotStatus.DRAFT,
        },
      }),
    );
    expect(runTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('does not allow administrators to correct into a full bucket', async () => {
    oneShotRepository.findUnique.mockResolvedValue(oneShot);
    oneShotRepository.count.mockResolvedValue(5);
    await expect(
      service.correct('one-shot-1', 'admin-1', { gameSystemId: 'system-2' }),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_MONTHLY_LIMIT_REACHED' },
    });
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(oneShotRepository.update).not.toHaveBeenCalled();
  });

  it('does not allow administrators to correct beyond 30 days', async () => {
    oneShotRepository.findUnique.mockResolvedValue(oneShot);
    await expect(
      service.correct('one-shot-1', 'admin-1', {
        scheduledAt: new Date(
          Date.now() + TABLE_RULE_WINDOW_MS + 60_000,
        ).toISOString(),
      }),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_SCHEDULE_TOO_FAR' },
    });
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(oneShotRepository.update).not.toHaveBeenCalled();
  });

  it.each([OneShotStatus.CANCELLED, OneShotStatus.COMPLETED])(
    'does not correct closed %s one-shots',
    async (status) => {
      oneShotRepository.findUnique.mockResolvedValue({ ...oneShot, status });
      await expect(
        service.correct('one-shot-1', 'admin-1', { gameSystemId: 'system-2' }),
      ).rejects.toMatchObject({ response: { code: 'ONE_SHOT_CLOSED' } });
      expect(oneShotRepository.count).not.toHaveBeenCalled();
      expect(sessionRepository.update).not.toHaveBeenCalled();
      expect(oneShotRepository.update).not.toHaveBeenCalled();
    },
  );

  it('rejects empty correction', async () => {
    await expect(
      service.correct('one-shot-1', 'admin-1', {}),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_CORRECTION_EMPTY' },
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(oneShotRepository.update).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
  });

  it('creates a one-shot exactly at the 30-day scheduling limit', async () => {
    const now = new Date('2026-10-20T12:00:00Z');
    jest.useFakeTimers({ now });
    try {
      const scheduledAt = new Date(now.getTime() + TABLE_RULE_WINDOW_MS);
      await service.create('master-1', {
        gameSystemId: 'system-1',
        title: 'No limite',
        session: { scheduledAt: scheduledAt.toISOString() },
      });
      expect(oneShotRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            session: { create: { campaignId: null, title: null, scheduledAt } },
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    { gameSystemId: 'system-2' },
    { scheduledAt: futureDate.toISOString() },
  ])(
    'corrects a single structural field %j and revalidates the effective system/date',
    async (dto) => {
      oneShotRepository.findUnique.mockResolvedValue(oneShot);
      await service.correct('one-shot-1', 'admin-1', dto);
      expect(actorMethods.assertActiveGameSystem).toHaveBeenCalledWith(
        dto.gameSystemId ?? oneShot.gameSystemId,
        prisma,
      );
      expect(sessionRepository.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { scheduledAt: futureDate },
      });
      expect(oneShotRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gameSystemId: dto.gameSystemId ?? oneShot.gameSystemId,
            approvalStatus: ApprovalStatus.PENDING,
          }),
        }),
      );
    },
  );

  it('publishes an approved one-shot with a future session', async () => {
    oneShotRepository.findUnique.mockResolvedValue({
      ...oneShot,
      approvalStatus: ApprovalStatus.APPROVED,
    });
    await service.publish('one-shot-1', 'master-1');
    expect(oneShotRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: OneShotStatus.SCHEDULED } }),
    );
  });

  it('rejects a non-administrator before accessing the aggregate', async () => {
    actorMethods.assertAdministrator.mockRejectedValueOnce(new Error('denied'));
    await expect(
      service.correct('one-shot-1', 'master-1', { gameSystemId: 'system-2' }),
    ).rejects.toThrow('denied');
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(oneShotRepository.update).not.toHaveBeenCalled();
    expect(sessionRepository.update).not.toHaveBeenCalled();
    expect(oneShotRepository.findUnique).not.toHaveBeenCalled();
  });
});
