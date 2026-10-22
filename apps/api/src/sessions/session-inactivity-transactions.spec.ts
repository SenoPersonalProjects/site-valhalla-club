import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../generated/prisma/client';
import { CampaignStatus, SessionStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StructuredLoggerService } from '../observability/structured-logger.service';
import { CampaignInactivityService } from '../campaigns/campaign-inactivity.service';
import { TableActorsService } from '../tables/table-actors.service';
import {
  TableRulesService,
  TABLE_RULE_WINDOW_MS,
} from '../tables/table-rules.service';
import { SessionsService } from './sessions.service';

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('serialization conflict', {
    code: 'P2034',
    clientVersion: '7.10.0',
  });
const future = new Date(Date.now() + 60 * 86_400_000);
const past = new Date(Date.now() - 60 * 86_400_000);
const session = {
  id: 'session-1',
  campaignId: 'campaign-1',
  oneShotId: null,
  status: SessionStatus.SCHEDULED,
  scheduledAt: past,
  campaign: { masterId: 'master-1' },
  oneShot: null,
  _count: { participants: 0, feedbacks: 0, reports: 0, sanctionScopes: 0 },
};

function harness() {
  const outside = jest.fn(() => {
    throw new Error('root state access forbidden');
  });
  const tx = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          status: 'APPROVED',
          clubRoles: [{ role: 'MASTER' }],
        }),
    },
    campaign: {
      findUnique: jest.fn().mockResolvedValue({
        masterId: 'master-1',
        status: CampaignStatus.ACTIVE,
      }),
      update: outside,
    },
    session: {
      findUnique: jest.fn().mockResolvedValue(session),
      create: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue(session),
      delete: jest.fn(),
    },
  };
  const transaction = jest.fn(
    async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(tx as unknown as Prisma.TransactionClient),
  );
  const prisma = {
    $transaction: transaction,
    user: { findUnique: outside },
    campaign: { findUnique: outside, update: outside },
    session: {
      findUnique: outside,
      create: outside,
      update: outside,
      delete: outside,
    },
  } as unknown as PrismaService;
  return {
    tx,
    transaction,
    outside,
    service: new SessionsService(
      prisma,
      new TableActorsService(prisma, new AuthorizationService(prisma)),
      new TableRulesService(prisma),
    ),
  };
}

describe('Campaign session transaction boundaries', () => {
  const invoke = (service: SessionsService, operation: string) => {
    if (operation === 'create')
      return service.createForCampaign('campaign-1', 'master-1', {
        scheduledAt: future.toISOString(),
      });
    if (operation === 'update')
      return service.update('session-1', 'master-1', {
        scheduledAt: future.toISOString(),
      });
    if (operation === 'changeStatus')
      return service.changeStatus('session-1', 'master-1', {
        status: SessionStatus.COMPLETED,
      });
    return service.remove('session-1', 'master-1');
  };

  it.each(['create', 'update', 'changeStatus', 'remove'])(
    '%s reads and writes only on the same Serializable TransactionClient',
    async (operation) => {
      const h = harness();
      await invoke(h.service, operation);
      expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(
        operation === 'create'
          ? h.tx.campaign.findUnique
          : h.tx.session.findUnique,
      ).toHaveBeenCalledTimes(1);
      const write =
        operation === 'create'
          ? h.tx.session.create
          : operation === 'remove'
            ? h.tx.session.delete
            : h.tx.session.update;
      expect(write).toHaveBeenCalledTimes(1);
      expect(h.tx.user.findUnique).toHaveBeenCalledTimes(1);
      expect(h.outside).not.toHaveBeenCalled();
      if (operation === 'create' || operation === 'update') {
        expect(write).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ scheduledAt: future }),
          }),
        );
      }
    },
  );

  it.each(['create', 'update', 'changeStatus', 'remove'])(
    '%s rejects a master whose authority is lost between transaction attempts',
    async (operation) => {
      const h = harness();
      h.transaction.mockImplementationOnce(async (callback) => {
        await callback(h.tx as unknown as Prisma.TransactionClient);
        h.tx.user.findUnique.mockResolvedValue({
          status: 'SUSPENDED',
          clubRoles: [{ role: 'MASTER' }],
        });
        throw conflict();
      });
      await expect(invoke(h.service, operation)).rejects.toMatchObject({
        response: { code: 'MASTER_ACCOUNT_NOT_APPROVED' },
      });
      expect(h.transaction).toHaveBeenCalledTimes(2);
      expect(h.tx.user.findUnique).toHaveBeenCalledTimes(2);
      const write =
        operation === 'create'
          ? h.tx.session.create
          : operation === 'remove'
            ? h.tx.session.delete
            : h.tx.session.update;
      expect(write).toHaveBeenCalledTimes(1);
      expect(h.outside).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['create', 'CAMPAIGN_ARCHIVED'],
    ['update', 'SESSION_CLOSED'],
    ['changeStatus', 'SESSION_NOT_STARTED'],
    ['remove', 'SESSION_DELETE_NOT_ALLOWED'],
  ])(
    '%s retries from freshly read state, rejecting %s after a concurrent change',
    async (operation, code) => {
      const h = harness();
      h.transaction.mockImplementationOnce(async (callback) => {
        await callback(h.tx as unknown as Prisma.TransactionClient);
        if (operation === 'create')
          h.tx.campaign.findUnique.mockResolvedValue({
            masterId: 'master-1',
            status: CampaignStatus.ARCHIVED,
          });
        if (operation === 'update')
          h.tx.session.findUnique.mockResolvedValue({
            ...session,
            status: SessionStatus.CANCELLED,
          });
        if (operation === 'changeStatus')
          h.tx.session.findUnique.mockResolvedValue({
            ...session,
            scheduledAt: future,
          });
        if (operation === 'remove')
          h.tx.session.findUnique.mockResolvedValue({
            ...session,
            _count: { ...session._count, participants: 1 },
          });
        throw conflict();
      });
      await expect(invoke(h.service, operation)).rejects.toMatchObject({
        response: { code },
      });
      expect(h.transaction).toHaveBeenCalledTimes(2);
      expect(
        operation === 'create'
          ? h.tx.campaign.findUnique
          : h.tx.session.findUnique,
      ).toHaveBeenCalledTimes(2);
      expect(
        operation === 'create'
          ? h.tx.session.create
          : operation === 'remove'
            ? h.tx.session.delete
            : h.tx.session.update,
      ).toHaveBeenCalledTimes(1);
      expect(h.outside).not.toHaveBeenCalled();
    },
  );

  it.each(['update', 'changeStatus', 'remove'])(
    'keeps one-shot session %s blocked before writes',
    async (operation) => {
      const h = harness();
      h.tx.session.findUnique.mockResolvedValue({
        ...session,
        oneShotId: 'one-shot-1',
      });
      await expect(invoke(h.service, operation)).rejects.toMatchObject({
        response: {
          code:
            operation === 'remove'
              ? 'ONE_SHOT_SESSION_DELETE_NOT_ALLOWED'
              : 'ONE_SHOT_SESSION_MANAGED_BY_ONE_SHOT',
        },
      });
      expect(h.tx.session.create).not.toHaveBeenCalled();
      expect(h.tx.session.update).not.toHaveBeenCalled();
      expect(h.tx.session.delete).not.toHaveBeenCalled();
      expect(h.outside).not.toHaveBeenCalled();
    },
  );
});

describe('PR #41 inactivity versus session writes', () => {
  it.each(['create', 'reschedule', 'reconciliation-first'])(
    'serializes %s without committing a stale inactivity decision or auto-reactivating',
    async (mode) => {
      const now = new Date();
      const baseline = new Date(
        now.getTime() - TABLE_RULE_WINDOW_MS - 86_400_000,
      );
      let status: CampaignStatus = CampaignStatus.ACTIVE;
      let scheduledAt: Date | null = mode === 'reschedule' ? baseline : null;
      let version = 0;
      const predicates: Array<{ scheduledAt: Date | null; matched: boolean }> =
        [];
      const campaignReads: CampaignStatus[] = [];
      const sessionReads: Array<Date | null> = [];
      let signalRead!: () => void, signalSessionCommit!: () => void;
      const snapshotRead = new Promise<void>((resolve) => {
        signalRead = resolve;
      });
      const sessionCommitted = new Promise<void>((resolve) => {
        signalSessionCommit = resolve;
      });
      const outside = jest.fn(() => {
        throw new Error('state access outside transaction');
      });
      const transaction = jest.fn(
        async (
          callback: (client: Prisma.TransactionClient) => Promise<unknown>,
          options: { isolationLevel: string },
        ) => {
          expect(options).toEqual({ isolationLevel: 'Serializable' });
          const snapshotVersion = version,
            snapshotStatus = status,
            snapshotDate = scheduledAt;
          let writesSession = false,
            writesCampaign = false,
            inactivity = false;
          let stagedDate = snapshotDate;
          const tx = {
            user: {
              findUnique: jest
                .fn()
                .mockResolvedValue({
                  status: 'APPROVED',
                  clubRoles: [{ role: 'MASTER' }],
                }),
            },
            campaign: {
              findUnique: jest.fn(async () => {
                campaignReads.push(snapshotStatus);
                return { masterId: 'master-1', status: snapshotStatus };
              }),
              update: outside,
              updateMany: jest.fn(
                async ({ where, data }: Prisma.CampaignUpdateManyArgs) => {
                  inactivity = true;
                  const recent = where!.sessions!.none!;
                  const threshold = (
                    recent.scheduledAt as Prisma.DateTimeFilter
                  ).gte as Date;
                  const matches =
                    snapshotStatus === where!.status &&
                    baseline <
                      ((where!.updatedAt as Prisma.DateTimeFilter)
                        .lt as Date) &&
                    !(snapshotDate && snapshotDate >= threshold);
                  expect(recent.status).toEqual({
                    not: SessionStatus.CANCELLED,
                  });
                  expect(data).toEqual({ status: CampaignStatus.INACTIVE });
                  predicates.push({
                    scheduledAt: snapshotDate,
                    matched: !!matches,
                  });
                  writesCampaign = !!matches;
                  signalRead();
                  return { count: matches ? 1 : 0 };
                },
              ),
            },
            session: {
              findUnique: jest.fn(async () => {
                sessionReads.push(snapshotDate);
                return {
                  ...session,
                  scheduledAt: snapshotDate,
                  campaign: { masterId: 'master-1', status: snapshotStatus },
                };
              }),
              create: jest.fn(
                async ({ data }: { data: { scheduledAt: Date } }) => {
                  writesSession = true;
                  stagedDate = data.scheduledAt;
                  return { id: 'session-1' };
                },
              ),
              update: jest.fn(
                async ({ data }: { data: { scheduledAt: Date } }) => {
                  writesSession = true;
                  stagedDate = data.scheduledAt;
                  return { id: 'session-1' };
                },
              ),
            },
          } as unknown as Prisma.TransactionClient;
          const result = await callback(tx);
          // Force the session commit between the old predicate and its attempted commit.
          if (inactivity && mode !== 'reconciliation-first')
            await sessionCommitted;
          if (snapshotVersion !== version) throw conflict();
          if (writesCampaign) status = CampaignStatus.INACTIVE;
          if (writesSession) {
            scheduledAt = stagedDate;
            signalSessionCommit();
          }
          if (writesCampaign || writesSession) version++;
          return result;
        },
      );
      const prisma = {
        $transaction: transaction,
        campaign: { update: outside, updateMany: outside, findUnique: outside },
        session: { create: outside, update: outside, findUnique: outside },
      } as unknown as PrismaService;
      const rules = new TableRulesService(prisma);
      const logger = {
        info: jest.fn(),
        error: jest.fn(),
      } as unknown as StructuredLoggerService;
      const reconciliation = new CampaignInactivityService(rules, logger);
      const sessions = new SessionsService(
        prisma,
        new TableActorsService(prisma, new AuthorizationService(prisma)),
        rules,
      );
      const pending = reconciliation.reconcile(now);
      if (mode === 'reconciliation-first') await pending;
      else await snapshotRead;
      if (mode === 'reschedule')
        await sessions.update('session-1', 'master-1', {
          scheduledAt: future.toISOString(),
        });
      else
        await sessions.createForCampaign('campaign-1', 'master-1', {
          scheduledAt: future.toISOString(),
        });
      expect(await pending).toEqual({
        count: mode === 'reconciliation-first' ? 1 : 0,
      });
      expect(status).toBe(
        mode === 'reconciliation-first'
          ? CampaignStatus.INACTIVE
          : CampaignStatus.ACTIVE,
      );
      expect(scheduledAt).toEqual(future);
      expect(baseline).toEqual(
        new Date(now.getTime() - TABLE_RULE_WINDOW_MS - 86_400_000),
      );
      expect(transaction).toHaveBeenCalledTimes(
        mode === 'reconciliation-first' ? 2 : 3,
      );
      expect(predicates).toEqual(
        mode === 'reconciliation-first'
          ? [{ scheduledAt: null, matched: true }]
          : [
              {
                scheduledAt: mode === 'reschedule' ? baseline : null,
                matched: true,
              },
              { scheduledAt: future, matched: false },
            ],
      );
      if (mode === 'reschedule') expect(sessionReads).toEqual([baseline]);
      else
        expect(campaignReads).toEqual([
          mode === 'reconciliation-first'
            ? CampaignStatus.INACTIVE
            : CampaignStatus.ACTIVE,
        ]);
      expect(outside).not.toHaveBeenCalled();
    },
  );
});
