import { sanctionsHarness } from '../../test/support/sanctions.harness';
import {
  AccountStatus,
  SanctionScopeType,
  SanctionType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { assertSanctionAllows } from './sanction-restrictions';
import { CampaignsService } from '../campaigns/campaigns.service';
import { OneShotsService } from '../one-shots/one-shots.service';
import { SessionsService } from '../sessions/sessions.service';
import { TableActorsService } from '../tables/table-actors.service';
import { TableRulesService } from '../tables/table-rules.service';
import { AuditService } from '../audit/audit.service';
import { OwnSanctionFiltersDto } from './sanctions.dto';

describe('Effective sanction restrictions', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());
  const client = (h: ReturnType<typeof sanctionsHarness>) =>
    h.root as unknown as PrismaService;

  it.each([SanctionType.ACCOUNT_SUSPENSION, SanctionType.EXPULSION])(
    'blocks normal operations for %s',
    async (type) => {
      const h = sanctionsHarness();
      h.fixture({
        type,
        endsAt:
          type === SanctionType.EXPULSION ? null : new Date('2035-01-01Z'),
      });
      await expect(
        assertSanctionAllows(client(h), 'target', 'ACCOUNT'),
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_SANCTIONED' } });
    },
  );
  it.each([
    { startsAt: new Date('2030-01-01T00:00:00.001Z') },
    { endsAt: new Date('2030-01-01T00:00:00Z') },
    { status: 'EXPIRED' as const },
    { status: 'REVERSED' as const },
    { userId: 'other' },
  ])(
    'ignores inactive, future, overdue and unrelated measures %j',
    async (extra) => {
      const h = sanctionsHarness();
      h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION, ...extra });
      await expect(
        assertSanctionAllows(client(h), 'target', 'ACCOUNT'),
      ).resolves.toBeUndefined();
    },
  );
  it.each([
    SanctionType.TABLE_CREATION_RESTRICTION,
    SanctionType.MASTER_ACTIVITY_RESTRICTION,
  ])('blocks creation for %s', async (type) => {
    const h = sanctionsHarness();
    h.fixture({ type });
    await expect(
      assertSanctionAllows(client(h), 'target', 'CREATE_TABLE'),
    ).rejects.toMatchObject({ response: { code: 'TABLE_SANCTIONED' } });
    await expect(
      assertSanctionAllows(client(h), 'target', 'ACCOUNT'),
    ).resolves.toBeUndefined();
  });
  it.each([
    SanctionType.TABLE_PARTICIPATION_RESTRICTION,
    SanctionType.EVENT_PARTICIPATION_RESTRICTION,
    SanctionType.CLUB_ACTIVITY_RESTRICTION,
  ])(
    'does not broaden %s into account or creation prohibition',
    async (type) => {
      const h = sanctionsHarness();
      h.fixture({ type });
      await assertSanctionAllows(client(h), 'target', 'ACCOUNT');
      await assertSanctionAllows(client(h), 'target', 'CREATE_TABLE');
      await assertSanctionAllows(client(h), 'target', 'MASTER', {
        campaignId: 'campaign',
      });
    },
  );
  it.each([
    ['GENERAL', null, null, { campaignId: 'campaign' }, true],
    [
      'CAMPAIGN',
      'campaign',
      null,
      { campaignId: 'campaign', sessionId: 'session' },
      true,
    ],
    ['CAMPAIGN', 'other', null, { campaignId: 'campaign' }, false],
    ['SESSION', null, 'session', { sessionId: 'session' }, true],
    ['SESSION', null, 'session', { campaignId: 'campaign' }, false],
    ['SESSION', null, 'other', { sessionId: 'session' }, false],
  ] as const)(
    'respects %s %s %s',
    async (scopeType, campaignId, sessionId, context, blocked) => {
      const h = sanctionsHarness();
      h.fixture({
        type: SanctionType.MASTER_ACTIVITY_RESTRICTION,
        scopeType,
        campaignId,
        sessionId,
      });
      const action = assertSanctionAllows(
        client(h),
        'target',
        'MASTER',
        context,
      );
      if (blocked)
        await expect(action).rejects.toMatchObject({
          response: { code: 'TABLE_SANCTIONED' },
        });
      else await expect(action).resolves.toBeUndefined();
    },
  );
  it('keeps a second live restriction after the first is reversed or expired', async () => {
    const h = sanctionsHarness();
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION, status: 'REVERSED' });
    h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION, endsAt: new Date(0) });
    h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    await expect(
      assertSanctionAllows(client(h), 'target', 'ACCOUNT'),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('selects only an existence marker and never leaks its contents', async () => {
    const h = sanctionsHarness();
    h.fixture({
      type: SanctionType.ACCOUNT_SUSPENSION,
      reason: 'PRIVATE_SANCTION_TEXT',
    });
    await expect(
      assertSanctionAllows(client(h), 'target', 'ACCOUNT'),
    ).rejects.toMatchObject({
      response: {
        message: 'Operação indisponível por restrição disciplinar vigente',
      },
    });
    expect(h.root.sanction.findFirst.mock.calls[0][0].select).toEqual({
      id: true,
    });
  });
  it('blocks a sanctioned administrator even in direct creation service calls', async () => {
    const h = sanctionsHarness();
    h.fixture({ userId: 'admin', type: SanctionType.ACCOUNT_SUSPENSION });
    await expect(
      h.service.create('admin', {
        userId: 'target',
        type: SanctionType.EXPULSION,
        scopeType: SanctionScopeType.GENERAL,
        reason: 'Administrative decision',
      }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_SANCTIONED' } });
    expect(h.state().logs).toHaveLength(0);
  });
  it('keeps own decision reads available, without an admin override into other accounts', async () => {
    const h = sanctionsHarness();
    const own = h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    const other = h.fixture({ userId: 'other' });
    const result = await h.service.listOwn(
      'target',
      new OwnSanctionFiltersDto(),
    );
    expect(result.meta.total).toBe(1);
    expect((await h.service.findOwn('target', own.id)).id).toBe(own.id);
    await expect(h.service.findOwn('target', other.id)).rejects.toMatchObject({
      response: { code: 'SANCTION_NOT_FOUND' },
    });
    expect(await h.service.findOwn('target', own.id)).not.toHaveProperty(
      'createdById',
    );
  });
  it('restricted access never bypasses account lifecycle rules', async () => {
    const h = sanctionsHarness();
    h.users.get('target')!.status = AccountStatus.DELETION_PENDING;
    await expect(
      h.service.listOwn('target', new OwnSanctionFiltersDto()),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('Table operations enforce sanctions inside their write transaction', () => {
  function domain() {
    const findFirst = jest.fn().mockResolvedValue({ id: 'private-sanction' });
    const campaign = {
      id: 'campaign',
      masterId: 'master',
      status: 'DRAFT',
      approvalStatus: 'APPROVED',
      _count: { sessions: 0, sanctionScopes: 0 },
    };
    const session = {
      id: 'session',
      campaignId: 'campaign',
      oneShotId: null,
      status: 'SCHEDULED',
      scheduledAt: new Date(0),
      campaign: { id: 'campaign', masterId: 'master' },
      oneShot: null,
    };
    const oneShot = {
      id: 'one-shot',
      masterId: 'master',
      status: 'SCHEDULED',
      approvalStatus: 'APPROVED',
      session: { id: 'one-session', scheduledAt: new Date(0) },
    };
    const db = {
      sanction: { findFirst },
      campaign: {
        findUnique: jest.fn().mockResolvedValue(campaign),
        create: jest.fn(),
        update: jest.fn(),
      },
      oneShot: {
        findUnique: jest.fn().mockResolvedValue(oneShot),
        create: jest.fn(),
        update: jest.fn(),
      },
      session: {
        findUnique: jest.fn().mockResolvedValue(session),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const prisma = db as unknown as PrismaService;
    db.$transaction.mockImplementation(
      (operation: (tx: PrismaService) => Promise<unknown>) => operation(prisma),
    );
    const actors = {
      assertMaster: jest.fn().mockResolvedValue(undefined),
      assertCanManage: jest.fn().mockResolvedValue(undefined),
      assertActiveGameSystem: jest.fn().mockResolvedValue(undefined),
    } as unknown as TableActorsService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const rules = new TableRulesService(prisma);
    return {
      db,
      campaign,
      session,
      oneShot,
      campaigns: new CampaignsService(prisma, actors, rules, audit),
      oneShots: new OneShotsService(prisma, actors, rules, audit),
      sessions: new SessionsService(prisma, actors, rules),
    };
  }
  it.each(['campaign', 'one-shot'])(
    'blocks %s creation without inserting records',
    async (kind) => {
      const h = domain();
      const action =
        kind === 'campaign'
          ? h.campaigns.create('master', {
              title: 'Test',
              gameSystemId: 'game',
            })
          : h.oneShots.create('master', {
              title: 'Test',
              gameSystemId: 'game',
              session: {
                scheduledAt: new Date(Date.now() + 86400000).toISOString(),
              },
            });
      await expect(action).rejects.toMatchObject({
        response: { code: 'TABLE_SANCTIONED' },
      });
      expect(h.db.campaign.create).not.toHaveBeenCalled();
      expect(h.db.oneShot.create).not.toHaveBeenCalled();
      expect(h.db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    },
  );
  it.each(['campaign', 'one-shot'])(
    'administrator publication cannot bypass %s master restrictions',
    async (kind) => {
      const h = domain();
      await expect(
        kind === 'campaign'
          ? h.campaigns.publish('campaign', 'admin')
          : h.oneShots.publish('one-shot', 'admin'),
      ).rejects.toMatchObject({ response: { code: 'TABLE_SANCTIONED' } });
      expect(h.db.campaign.update).not.toHaveBeenCalled();
      expect(h.db.oneShot.update).not.toHaveBeenCalled();
    },
  );
  it('blocks adding or changing sessions within a restricted campaign', async () => {
    const h = domain();
    await expect(
      h.sessions.createForCampaign('campaign', 'admin', {
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      h.sessions.update('session', 'master', { title: 'Updated' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.db.session.create).not.toHaveBeenCalled();
    expect(h.db.session.update).not.toHaveBeenCalled();
  });
  it.each(['campaign', 'one-shot'])(
    'blocks %s completion while keeping explicit cancellation available',
    async (kind) => {
      const h = domain();
      const complete =
        kind === 'campaign'
          ? h.sessions.changeStatus('session', 'admin', { status: 'COMPLETED' })
          : h.oneShots.changeStatus('one-shot', 'admin', {
              status: 'COMPLETED',
            });
      await expect(complete).rejects.toMatchObject({ status: 403 });
      h.db.session.update.mockResolvedValue({ id: 'session' });
      h.db.oneShot.update.mockResolvedValue({ id: 'one-shot' });
      await (kind === 'campaign'
        ? h.sessions.changeStatus('session', 'admin', {
            status: 'CANCELLED',
            reason: 'Administrative cancellation',
          })
        : h.oneShots.changeStatus('one-shot', 'admin', {
            status: 'CANCELLED',
            reason: 'Administrative cancellation',
          }));
      expect(h.db.session.update).toHaveBeenCalled();
    },
  );
});
