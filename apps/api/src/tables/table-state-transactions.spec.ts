import { Prisma } from '../generated/prisma/client';
import {
  ApprovalStatus,
  CampaignStatus,
  OneShotStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import { CampaignsService } from '../campaigns/campaigns.service';
import { OneShotsService } from '../one-shots/one-shots.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { TableActorsService } from './table-actors.service';
import { TableRulesService } from './table-rules.service';

describe('Operational state transaction boundaries', () => {
  const campaign = {
    id: 'campaign-1',
    masterId: 'master-1',
    status: CampaignStatus.ACTIVE,
    approvalStatus: ApprovalStatus.APPROVED,
    updatedAt: new Date('2026-09-01T12:00:00Z'),
    _count: { sessions: 0, sanctionScopes: 0 },
  };
  const oneShot = {
    id: 'one-shot-1',
    masterId: 'master-1',
    gameSystemId: 'system-1',
    status: OneShotStatus.SCHEDULED,
    approvalStatus: ApprovalStatus.APPROVED,
    session: {
      id: 'session-1',
      scheduledAt: new Date(Date.now() - 86_400_000),
      _count: { participants: 0, feedbacks: 0, reports: 0, sanctionScopes: 0 },
    },
  };
  function harness() {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'APPROVED',
          systemRole: 'ADMIN',
          clubRoles: [{ role: 'MASTER' }],
        }),
      },
      campaign: {
        findUnique: jest.fn().mockResolvedValue(campaign),
        update: jest.fn(),
        delete: jest.fn(),
      },
      oneShot: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(oneShot),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      session: { update: jest.fn(), delete: jest.fn() },
      gameSystem: { findUnique: jest.fn().mockResolvedValue({ active: true }) },
    };
    const rootRead = jest.fn(() => {
      throw new Error('state read outside transaction');
    });
    const rootWrite = jest.fn(() => {
      throw new Error('state write outside transaction');
    });
    const transaction = jest.fn(
      async (
        operation: (client: Prisma.TransactionClient) => Promise<unknown>,
      ) => operation(tx as unknown as Prisma.TransactionClient),
    );
    const prisma = {
      $transaction: transaction,
      campaign: { findUnique: rootRead, update: rootWrite, delete: rootWrite },
      oneShot: { findUnique: rootRead, update: rootWrite, delete: rootWrite },
      session: { update: rootWrite, delete: rootWrite },
      gameSystem: { findUnique: rootRead },
      user: { findUnique: rootRead },
    } as unknown as PrismaService;
    const rules = new TableRulesService(prisma);
    return {
      tx,
      rootRead,
      rootWrite,
      transaction,
      prisma,
      rules,
      actors: new TableActorsService(prisma, new AuthorizationService(prisma)),
    };
  }

  it('rechecks MASTER inside each OneShot creation attempt, including after P2034', async () => {
    const h = harness();
    h.transaction.mockImplementationOnce(async (callback) => {
      await callback(h.tx as unknown as Prisma.TransactionClient);
      h.tx.user.findUnique.mockResolvedValue({
        status: 'APPROVED',
        systemRole: 'ADMIN',
        clubRoles: [],
      });
      throw new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      });
    });
    const service = new OneShotsService(h.prisma, h.actors, h.rules);
    await expect(
      service.create('master-1', {
        gameSystemId: 'system-1',
        title: 'One-shot',
        session: {
          scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'MASTER_ROLE_REQUIRED' } });
    expect(h.transaction).toHaveBeenCalledTimes(2);
    expect(h.tx.user.findUnique).toHaveBeenCalledTimes(2);
    expect(h.tx.oneShot.create).toHaveBeenCalledTimes(1);
    expect(h.tx.gameSystem.findUnique).toHaveBeenCalledWith({
      where: { id: 'system-1' },
      select: { active: true },
    });
    expect(h.rootRead).not.toHaveBeenCalled();
  });

  it.each(['update', 'remove', 'publish', 'changeStatus', 'review'] as const)(
    'reads and validates one-shot state inside the writing transaction for %s',
    async (operation) => {
      const h = harness();
      const service = new OneShotsService(h.prisma, h.actors, h.rules);
      if (operation === 'remove')
        h.tx.oneShot.findUnique.mockResolvedValue({
          ...oneShot,
          status: OneShotStatus.DRAFT,
        });
      if (operation === 'publish')
        h.tx.oneShot.findUnique.mockResolvedValue({
          ...oneShot,
          session: {
            ...oneShot.session,
            scheduledAt: new Date(Date.now() + 86_400_000),
          },
        });
      if (operation === 'update')
        await service.update('one-shot-1', 'master-1', {
          title: 'Novo título',
        });
      if (operation === 'remove')
        await service.remove('one-shot-1', 'master-1');
      if (operation === 'publish')
        await service.publish('one-shot-1', 'master-1');
      if (operation === 'changeStatus')
        await service.changeStatus('one-shot-1', 'master-1', {
          status: OneShotStatus.COMPLETED,
        });
      if (operation === 'review')
        await service.review('one-shot-1', 'admin-1', {
          decision: ApprovalStatus.REJECTED,
          note: 'Revisão',
        });
      expect(h.tx.oneShot.findUnique).toHaveBeenCalledTimes(1);
      expect(
        operation === 'remove' ? h.tx.oneShot.delete : h.tx.oneShot.update,
      ).toHaveBeenCalledTimes(1);
      expect(h.tx.user.findUnique).toHaveBeenCalledTimes(1);
      expect(h.rootRead).not.toHaveBeenCalled();
      expect(h.rootWrite).not.toHaveBeenCalled();
      expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    },
  );

  it.each(['update', 'remove', 'changeStatus', 'review'] as const)(
    'reads campaign state inside the writing transaction for %s',
    async (operation) => {
      const h = harness();
      const service = new CampaignsService(h.prisma, h.actors, h.rules);
      if (operation === 'remove')
        h.tx.campaign.findUnique.mockResolvedValue({
          ...campaign,
          status: CampaignStatus.DRAFT,
        });
      if (operation === 'update')
        await service.update('campaign-1', 'master-1', {
          title: 'Novo título',
        });
      if (operation === 'remove')
        await service.remove('campaign-1', 'master-1');
      if (operation === 'changeStatus')
        await service.changeStatus('campaign-1', 'master-1', {
          status: CampaignStatus.ARCHIVED,
        });
      if (operation === 'review')
        await service.review('campaign-1', 'admin-1', {
          decision: ApprovalStatus.REJECTED,
          note: 'Revisão',
        });
      expect(h.tx.campaign.findUnique).toHaveBeenCalledTimes(1);
      expect(h.tx.user.findUnique).toHaveBeenCalledTimes(1);
      expect(h.rootRead).not.toHaveBeenCalled();
      expect(h.rootWrite).not.toHaveBeenCalled();
    },
  );

  it.each(['campaign-review', 'one-shot-review', 'one-shot-correction'])(
    '%s rechecks administrative authority after a transaction conflict',
    async (operation) => {
      const h = harness();
      h.transaction.mockImplementationOnce(async (callback) => {
        await callback(h.tx as unknown as Prisma.TransactionClient);
        h.tx.user.findUnique.mockResolvedValue({
          status: 'APPROVED',
          systemRole: 'USER',
          clubRoles: [{ role: 'MASTER' }],
        });
        throw new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: '7.10.0',
        });
      });
      const campaigns = new CampaignsService(h.prisma, h.actors, h.rules);
      const oneShots = new OneShotsService(h.prisma, h.actors, h.rules);
      const result =
        operation === 'campaign-review'
          ? campaigns.review('campaign-1', 'admin-1', {
              decision: ApprovalStatus.REJECTED,
              note: 'Review',
            })
          : operation === 'one-shot-review'
            ? oneShots.review('one-shot-1', 'admin-1', {
                decision: ApprovalStatus.REJECTED,
                note: 'Review',
              })
            : oneShots.correct('one-shot-1', 'admin-1', {
                gameSystemId: 'system-2',
                scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
              });
      await expect(result).rejects.toMatchObject({
        response: { code: 'ADMIN_ROLE_REQUIRED' },
      });
      expect(h.transaction).toHaveBeenCalledTimes(2);
      expect(h.tx.user.findUnique).toHaveBeenCalledTimes(2);
      // The first write is rolled back; the new attempt cannot reuse its authority.
      expect(
        operation === 'campaign-review'
          ? h.tx.campaign.update
          : h.tx.oneShot.update,
      ).toHaveBeenCalledTimes(1);
      expect(h.rootRead).not.toHaveBeenCalled();
    },
  );

  it('validates the effective game system only on the correction transaction client', async () => {
    const h = harness();
    const service = new OneShotsService(
      h.prisma,
      new TableActorsService(h.prisma, new AuthorizationService(h.prisma)),
      h.rules,
    );
    await service.correct('one-shot-1', 'admin-1', {
      scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(h.tx.gameSystem.findUnique).toHaveBeenCalledWith({
      where: { id: 'system-1' },
      select: { active: true },
    });
    expect(h.tx.gameSystem.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      h.tx.oneShot.count.mock.invocationCallOrder[0],
    );
    expect(h.rootRead).not.toHaveBeenCalled();
    expect(h.tx.session.update).toHaveBeenCalled();
    expect(h.tx.oneShot.update).toHaveBeenCalled();
  });

  it('re-reads a concurrent approval/publication and does not refresh ACTIVE on retry', async () => {
    const h = harness();
    const service = new CampaignsService(h.prisma, h.actors, h.rules);
    h.tx.campaign.findUnique.mockResolvedValueOnce({
      ...campaign,
      status: CampaignStatus.INACTIVE,
    });
    h.transaction.mockImplementationOnce(async (operation) => {
      await operation(h.tx as unknown as Prisma.TransactionClient);
      throw new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      });
    });
    const result = await service.review('campaign-1', 'admin-1', {
      decision: ApprovalStatus.APPROVED,
    });
    expect(result).toBe(campaign);
    expect(result.updatedAt).toEqual(new Date('2026-09-01T12:00:00Z'));
    // One attempted write was rolled back; retry observes ACTIVE and writes nothing.
    expect(h.tx.campaign.update).toHaveBeenCalledTimes(1);
    expect(h.tx.campaign.findUnique).toHaveBeenCalledTimes(2);
    expect(h.transaction).toHaveBeenCalledTimes(2);
  });

  it('does not complete a session using a date read before concurrent correction', async () => {
    const h = harness();
    const service = new OneShotsService(h.prisma, h.actors, h.rules);
    h.transaction.mockImplementationOnce(async (operation) => {
      await operation(h.tx as unknown as Prisma.TransactionClient);
      h.tx.oneShot.findUnique.mockResolvedValue({
        ...oneShot,
        status: OneShotStatus.DRAFT,
        session: {
          ...oneShot.session,
          scheduledAt: new Date(Date.now() + 86_400_000),
        },
      });
      throw new Prisma.PrismaClientKnownRequestError('conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      });
    });
    await expect(
      service.changeStatus('one-shot-1', 'master-1', {
        status: OneShotStatus.COMPLETED,
      }),
    ).rejects.toMatchObject({
      response: { code: 'ONE_SHOT_STATUS_TRANSITION_INVALID' },
    });
    expect(h.tx.oneShot.findUnique).toHaveBeenCalledTimes(2);
    expect(h.tx.session.update).toHaveBeenCalledTimes(1);
    expect(h.tx.oneShot.update).toHaveBeenCalledTimes(1);
    expect(h.rootRead).not.toHaveBeenCalled();
  });
});
