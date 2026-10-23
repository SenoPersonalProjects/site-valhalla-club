import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../generated/prisma/client';
import {
  AccountStatus,
  ApprovalStatus,
  CampaignStatus,
  ClubRole,
  OneShotStatus,
  SystemRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUsersService } from '../admin/users/admin-users.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { JwtService } from '@nestjs/jwt';
import { CampaignsService } from '../campaigns/campaigns.service';
import { OneShotsService } from '../one-shots/one-shots.service';
import { TableActorsService } from '../tables/table-actors.service';
import { TableRulesService } from '../tables/table-rules.service';
import { AUDIT_ACTION, AUDIT_ENTITY } from './audit.constants';
import { ListAuditLogsDto } from './audit.dto';
import { AuditService, auditLogSelect } from './audit.service';

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError('private SQL', {
    code: 'P2034',
    clientVersion: '7',
  });

// State is copied per transaction and published only on commit. A call-count
// assertion alone would incorrectly count writes from aborted attempts.
function harness() {
  let state: any = {
    operator: {
      id: 'operator',
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.DEV,
    },
    user: {
      id: 'target',
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.USER,
    },
    links: [],
    logs: [],
    campaign: {
      id: 'campaign',
      status: CampaignStatus.DRAFT,
      approvalStatus: ApprovalStatus.PENDING,
      reviewNote: 'private-review',
    },
    oneShot: {
      id: 'one-shot',
      status: OneShotStatus.DRAFT,
      approvalStatus: ApprovalStatus.APPROVED,
      gameSystemId: 'system',
      reviewedById: 'operator',
      reviewNote: 'private-review',
      session: {
        id: 'session',
        scheduledAt: new Date(Date.now() + 86_400_000),
      },
    },
  };
  let aborts = 0,
    auditFails = false,
    writeFails = false;
  let afterAbort: (() => void) | undefined;
  let commitFails = false;
  const clients: any[] = [];
  const root: any = {
    auditLog: {
      create: jest.fn(() => {
        throw Error('Root audit used');
      }),
    },
    $transaction: jest.fn(async (operation: any, options: any) => {
      const draft = structuredClone(state);
      const tx: any = {
        user: {
          findUnique: jest.fn(async ({ where }: any) =>
            where.id === 'operator'
              ? draft.operator
              : where.id === 'target'
                ? draft.user
                : null,
          ),
          updateMany: jest.fn(async ({ data }: any) => {
            if (writeFails) throw Error('mutation failed');
            Object.assign(draft.user, data);
            return { count: 1 };
          }),
        },
        userClubRole: {
          createMany: jest.fn(async ({ data }: any) => {
            if (draft.links.some((l: any) => l.role === data.role))
              return { count: 0 };
            draft.links.push({
              id: 'cuid-link-' + draft.links.length,
              ...data,
            });
            return { count: 1 };
          }),
          findUnique: jest.fn(
            async ({ where }: any) =>
              draft.links.find((l: any) => l.role === where.userId_role.role) ??
              null,
          ),
          deleteMany: jest.fn(async ({ where }: any) => {
            const before = draft.links.length;
            draft.links = draft.links.filter((l: any) => l.role !== where.role);
            return { count: before - draft.links.length };
          }),
        },
        campaign: {
          findUnique: jest.fn(async () => draft.campaign),
          update: jest.fn(async ({ data }: any) =>
            Object.assign(draft.campaign, data),
          ),
        },
        oneShot: {
          findUnique: jest.fn(async () => draft.oneShot),
          count: jest.fn(async () => 0),
          update: jest.fn(async ({ data }: any) =>
            Object.assign(draft.oneShot, data),
          ),
        },
        session: {
          update: jest.fn(async ({ data }: any) =>
            Object.assign(draft.oneShot.session, data),
          ),
        },
        gameSystem: { findUnique: jest.fn(async () => ({ active: true })) },
        auditLog: {
          create: jest.fn(async ({ data }: any) => {
            if (auditFails) throw Error('audit failed');
            draft.logs.push({ id: `log-${draft.logs.length}`, ...data });
            return data;
          }),
          findMany: jest.fn(async () => draft.logs),
          count: jest.fn(async () => draft.logs.length),
        },
      };
      clients.push(tx);
      const result = await operation(tx);
      if (aborts-- > 0) {
        afterAbort?.();
        throw conflict();
      }
      if (commitFails) throw Error('commit failed');
      state = draft;
      return result;
    }),
  };
  const prisma = root as PrismaService;
  const authorization = new AuthorizationService(prisma);
  const audit = new AuditService(prisma, authorization);
  const actors = new TableActorsService(prisma, authorization);
  const rules = new TableRulesService(prisma);
  return {
    root,
    clients,
    audit,
    state: () => state,
    admin: new AdminUsersService(prisma, authorization, audit),
    auth: new AuthService(
      prisma,
      {} as PasswordService,
      {} as JwtService,
      actors,
      audit,
    ),
    campaigns: new CampaignsService(prisma, actors, rules, audit),
    oneShots: new OneShotsService(prisma, actors, rules, audit),
    failAudit: () => {
      auditFails = true;
    },
    failCommit: () => {
      commitFails = true;
    },
    failWrite: () => {
      writeFails = true;
    },
    abort: (count: number, callback?: () => void) => {
      aborts = count;
      afterAbort = callback;
    },
  };
}

describe('Persistent administrative audit integration', () => {
  it('defines exactly seven stable actions and three entity types', () => {
    expect(Object.values(AUDIT_ACTION)).toEqual([
      'USER_REGISTRATION_REVIEWED',
      'USER_SYSTEM_ROLE_CHANGED',
      'USER_CLUB_ROLE_GRANTED',
      'USER_CLUB_ROLE_REMOVED',
      'CAMPAIGN_APPROVAL_REVIEWED',
      'ONE_SHOT_APPROVAL_REVIEWED',
      'ONE_SHOT_CORRECTED',
    ]);
    expect(Object.values(AUDIT_ENTITY)).toEqual([
      'USER',
      'CAMPAIGN',
      'ONE_SHOT',
    ]);
  });

  it('uses only the supplied transaction, supports absent requestId and future null actor', async () => {
    const h = harness();
    await h.root.$transaction((tx: Prisma.TransactionClient) =>
      h.audit.record(tx, {
        actorId: null,
        entityId: 'target',
        entityType: 'USER',
        action: AUDIT_ACTION.USER_CLUB_ROLE_REMOVED,
        metadata: { changed: false, role: ClubRole.PLAYER },
      }),
    );
    expect(h.root.auditLog.create).not.toHaveBeenCalled();
    expect(h.state().logs).toEqual([
      {
        id: 'log-0',
        actorId: null,
        entityId: 'target',
        entityType: 'USER',
        action: AUDIT_ACTION.USER_CLUB_ROLE_REMOVED,
        requestId: null,
        metadata: { changed: false, role: 'PLAYER' },
      },
    ]);
  });

  it('records changed and no-op SystemRole requests exactly once each', async () => {
    const h = harness();
    await h.admin.changeSystemRole(
      'target',
      'operator',
      SystemRole.ADMIN,
      'request-1',
    );
    await h.admin.changeSystemRole(
      'target',
      'operator',
      SystemRole.ADMIN,
      'request-2',
    );
    expect(h.state().logs.map((l: any) => l.metadata)).toEqual([
      { changed: true, fromSystemRole: 'USER', toSystemRole: 'ADMIN' },
      { changed: false, fromSystemRole: 'ADMIN', toSystemRole: 'ADMIN' },
    ]);
    expect(h.clients[1].user.updateMany).not.toHaveBeenCalled();
  });

  it.each(Object.values(ClubRole))(
    'grants and removes %s with exact mutation-derived changed values',
    async (role) => {
      const h = harness();
      await h.admin.grantClubRole('target', 'operator', role, 'grant');
      const original = structuredClone(h.state().links[0]);
      await h.admin.grantClubRole('target', 'operator', role, 'grant-again');
      expect(h.state().links).toEqual([original]);
      await h.admin.removeClubRole('target', 'operator', role, 'remove');
      await h.admin.removeClubRole('target', 'operator', role, 'remove-again');
      expect(h.state().logs.map((l: any) => l.metadata)).toEqual(
        [true, false, true, false].map((changed) => ({ changed, role })),
      );
      for (const call of h.root.$transaction.mock.calls)
        expect(call[1].isolationLevel).toBe('ReadCommitted');
    },
  );

  it.each(['APPROVED', 'REJECTED'] as const)(
    'audits initial registration %s and accepted repetition',
    async (decision) => {
      const h = harness();
      h.state().user.status = 'PENDING';
      await h.auth.review(
        'target',
        'operator',
        { decision, note: 'private-review' },
        'review',
      );
      await h.auth.review(
        'target',
        'operator',
        { decision, note: 'private-review' },
        'repeat',
      );
      expect(h.state().logs.map((l: any) => l.metadata)).toEqual([
        { changed: true, fromStatus: 'PENDING', toStatus: decision },
        { changed: false, fromStatus: decision, toStatus: decision },
      ]);
    },
  );

  it('audits campaign review and ACTIVE reapproval no-op without renewing baseline', async () => {
    const h = harness();
    await h.campaigns.review(
      'campaign',
      'operator',
      { decision: ApprovalStatus.APPROVED, note: 'private-review' },
      'campaign-review',
    );
    h.state().campaign.status = 'ACTIVE';
    h.state().campaign.updatedAt = new Date('2026-01-01Z');
    await h.campaigns.review(
      'campaign',
      'operator',
      { decision: ApprovalStatus.APPROVED },
      'campaign-repeat',
    );
    expect(h.state().logs.map((l: any) => l.metadata.changed)).toEqual([
      true,
      false,
    ]);
    expect(h.clients[1].campaign.update).not.toHaveBeenCalled();
    expect(h.state().campaign.updatedAt).toEqual(new Date('2026-01-01Z'));
  });

  it('audits an identical OneShot review as unchanged while preserving review writes', async () => {
    const h = harness();
    await h.oneShots.review(
      'one-shot',
      'operator',
      { decision: ApprovalStatus.APPROVED, note: 'private-review' },
      'oneshot-review',
    );
    expect(h.state().logs[0]).toMatchObject({
      action: 'ONE_SHOT_APPROVAL_REVIEWED',
      metadata: {
        changed: false,
        fromApprovalStatus: 'APPROVED',
        toApprovalStatus: 'APPROVED',
      },
    });
    expect(h.clients[0].oneShot.update).toHaveBeenCalledTimes(1);
  });

  it('distinguishes repeated campaign review and a real note change without storing the note', async () => {
    const h = harness();
    await h.campaigns.review('campaign', 'operator', {
      decision: ApprovalStatus.APPROVED,
    });
    await h.campaigns.review('campaign', 'operator', {
      decision: ApprovalStatus.APPROVED,
    });
    await h.campaigns.review('campaign', 'operator', {
      decision: ApprovalStatus.APPROVED,
      note: 'private-review',
    });
    expect(h.state().logs.map((entry: any) => entry.metadata.changed)).toEqual([
      true,
      false,
      true,
    ]);
    expect(JSON.stringify(h.state().logs)).not.toContain('private-review');
  });

  it('records only changed technical field names on correction, including approval reset', async () => {
    const h = harness();
    h.state().oneShot.status = 'SCHEDULED';
    await h.oneShots.correct(
      'one-shot',
      'operator',
      {
        gameSystemId: 'other-system',
        scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      },
      'correction',
    );
    expect(h.state().logs[0]).toMatchObject({
      action: 'ONE_SHOT_CORRECTED',
      metadata: {
        changed: true,
        fields: [
          'gameSystemId',
          'scheduledAt',
          'approvalStatus',
          'status',
          'review',
        ],
      },
    });
    await h.oneShots.correct(
      'one-shot',
      'operator',
      { gameSystemId: 'other-system' },
      'repeat',
    );
    expect(h.state().logs[1].metadata).toEqual({ changed: false, fields: [] });
  });

  const operations = [
    (h: ReturnType<typeof harness>) => {
      return h.auth.review('target', 'operator', { decision: 'APPROVED' });
    },
    (h: ReturnType<typeof harness>) =>
      h.admin.changeSystemRole('target', 'operator', SystemRole.ADMIN),
    (h: ReturnType<typeof harness>) =>
      h.admin.grantClubRole('target', 'operator', ClubRole.MASTER),
    (h: ReturnType<typeof harness>) => {
      return h.admin.removeClubRole('target', 'operator', ClubRole.MASTER);
    },
    (h: ReturnType<typeof harness>) =>
      h.campaigns.review('campaign', 'operator', {
        decision: ApprovalStatus.APPROVED,
      }),
    (h: ReturnType<typeof harness>) =>
      h.oneShots.review('one-shot', 'operator', {
        decision: ApprovalStatus.REJECTED,
        note: 'private-review',
      }),
    (h: ReturnType<typeof harness>) =>
      h.oneShots.correct('one-shot', 'operator', {
        gameSystemId: 'other-system',
      }),
  ];
  it.each(operations.map((operation, index) => ({ operation, index })))(
    'rolls back mutation $index when audit fails',
    async ({ operation, index }) => {
      const h = harness();
      h.failAudit();
      if (index === 0) h.state().user.status = 'PENDING';
      if (index === 3)
        h.state().links = [
          {
            id: 'original',
            role: 'MASTER',
            grantedById: 'operator',
            grantedAt: new Date('2026-01-01Z'),
          },
        ];
      const before = structuredClone(h.state());
      await expect(operation(h)).rejects.toThrow('audit failed');
      expect(h.state()).toEqual(before);
    },
  );

  it('does not audit unsuccessful mutation, authorization, conflict or missing target', async () => {
    const h = harness();
    h.failWrite();
    await expect(
      h.admin.changeSystemRole('target', 'operator', SystemRole.ADMIN),
    ).rejects.toThrow('mutation failed');
    await expect(
      h.admin.changeSystemRole('operator', 'operator', SystemRole.USER),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      h.admin.changeSystemRole('missing', 'operator', SystemRole.USER),
    ).rejects.toMatchObject({ status: 404 });
    h.state().operator.systemRole = 'USER';
    await expect(
      h.admin.grantClubRole('target', 'operator', ClubRole.MASTER),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.state().logs).toEqual([]);
    for (const tx of h.clients)
      expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rolls back first audit on P2034 and commits only one event on full retry', async () => {
    const h = harness();
    h.abort(1);
    await h.admin.changeSystemRole(
      'target',
      'operator',
      SystemRole.ADMIN,
      'same-request',
    );
    expect(h.clients).toHaveLength(2);
    for (const tx of h.clients) {
      expect(tx.user.findUnique).toHaveBeenCalledTimes(2);
      expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    }
    expect(h.state().logs).toHaveLength(1);
    expect(h.state().user.systemRole).toBe('ADMIN');
    expect(h.state().logs[0].metadata).toEqual({
      changed: true,
      fromSystemRole: 'USER',
      toSystemRole: 'ADMIN',
    });
  });

  it('rechecks authorization on retry and leaves no event after operator demotion', async () => {
    const h = harness();
    h.abort(1, () => {
      h.state().operator.systemRole = 'USER';
    });
    await expect(
      h.admin.changeSystemRole('target', 'operator', SystemRole.ADMIN),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.state().logs).toEqual([]);
    expect(h.state().user.systemRole).toBe('USER');
    expect(h.clients[1].auditLog.create).not.toHaveBeenCalled();
  });

  it('leaves no mutation or event after a non-retryable failure at commit', async () => {
    const h = harness();
    h.failCommit();
    await expect(
      h.admin.changeSystemRole('target', 'operator', SystemRole.ADMIN),
    ).rejects.toThrow('commit failed');
    expect(h.clients[0].auditLog.create).toHaveBeenCalledTimes(1);
    expect(h.state().user.systemRole).toBe('USER');
    expect(h.state().logs).toEqual([]);
    expect(h.root.$transaction).toHaveBeenCalledTimes(1);
  });

  it('concurrent duplicate grants audit the actual winner only as changed without isolation escalation', async () => {
    const h = harness();
    const execute = h.root.$transaction.getMockImplementation()!;
    let lock: Promise<unknown> = Promise.resolve();
    // Simulate conflicting unique inserts waiting for the prior writer.
    h.root.$transaction.mockImplementation((operation: any, options: any) => {
      const result = lock.then(() => execute(operation, options));
      lock = result.catch(() => undefined);
      return result;
    });
    const results = await Promise.all([
      h.admin.grantClubRole(
        'target',
        'operator',
        ClubRole.MASTER,
        'concurrent-a',
      ),
      h.admin.grantClubRole(
        'target',
        'operator',
        ClubRole.MASTER,
        'concurrent-b',
      ),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(h.state().links).toHaveLength(1);
    expect(h.state().logs.map((l: any) => l.metadata.changed)).toEqual([
      true,
      false,
    ]);
    expect(h.root.$transaction).toHaveBeenCalledTimes(2);
    for (const call of h.root.$transaction.mock.calls)
      expect(call[1]).toEqual({ isolationLevel: 'ReadCommitted' });
  });

  it('keeps Prisma default IDs, counts the actual insert and does not audit failed inserts', async () => {
    const h = harness();
    await h.admin.grantClubRole('target', 'operator', ClubRole.MASTER);
    expect(h.clients[0].userClubRole.createMany).toHaveBeenCalledWith({
      data: {
        userId: 'target',
        role: 'MASTER',
        grantedById: 'operator',
        grantedAt: expect.any(Date),
      },
      skipDuplicates: true,
    });
    expect(
      h.clients[0].userClubRole.createMany.mock.calls[0][0].data,
    ).not.toHaveProperty('id');
    expect(h.state().logs).toHaveLength(1);
    const execute = h.root.$transaction.getMockImplementation()!;
    h.root.$transaction.mockImplementationOnce((operation: any, options: any) =>
      execute(async (tx: any) => {
        tx.userClubRole.createMany.mockRejectedValueOnce(
          new Error('insert failed'),
        );
        return operation(tx);
      }, options),
    );
    await expect(
      h.admin.grantClubRole('target', 'operator', ClubRole.PLAYER),
    ).rejects.toThrow('insert failed');
    expect(h.state().logs).toHaveLength(1);
    expect(h.state().links).toHaveLength(1);
    expect(h.clients[1].auditLog.create).not.toHaveBeenCalled();
  });

  it('fails closed without audit if a concurrent removal wins before the post-insert read', async () => {
    const h = harness();
    const execute = h.root.$transaction.getMockImplementation()!;
    h.root.$transaction.mockImplementationOnce((operation: any, options: any) =>
      execute(async (tx: any) => {
        tx.userClubRole.createMany.mockResolvedValueOnce({ count: 0 });
        tx.userClubRole.findUnique.mockResolvedValueOnce(null);
        return operation(tx);
      }, options),
    );
    await expect(
      h.admin.grantClubRole('target', 'operator', ClubRole.MASTER),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'USER_ROLE_CONFLICT' },
    });
    expect(h.state().logs).toEqual([]);
    expect(h.state().links).toEqual([]);
    expect(h.root.$transaction).toHaveBeenCalledTimes(1);
    expect(h.clients[0].auditLog.create).not.toHaveBeenCalled();
  });

  it('contains no PII or free text across all persisted event types', async () => {
    const h = harness();
    h.state().user.status = 'PENDING';
    Object.assign(h.state().user, {
      email: 'target-sensitive@example.com',
      passwordHash: 'private-hash',
      profile: {
        displayName: 'private-name',
        whatsappNumber: '+447700900123',
        birthDate: '1995-01-01',
      },
      suspensionReason: 'private-reason',
    });
    for (const operation of operations) await operation(h);
    const serialized = JSON.stringify(h.state().logs);
    for (const prohibited of [
      'target-sensitive@example.com',
      'private-hash',
      'private-name',
      '+447700900123',
      '1995-01-01',
      'private-reason',
      'private-review',
      'email',
      'whatsappNumber',
      'birthDate',
      'displayName',
      'reviewNote',
      'password',
      'passwordHash',
      'JWT',
      'Authorization',
      'cookie',
      'suspensionReason',
      'description',
    ])
      expect(serialized).not.toContain(prohibited);
    expect(h.state().logs).toHaveLength(7);
  });

  it('lists exact filters with explicit select, deterministic ordering and one snapshot; reads do not audit', async () => {
    const h = harness();
    const query = {
      ...new ListAuditLogsDto(),
      page: 2,
      limit: 10,
      actorId: 'operator',
      entityType: 'USER' as const,
      entityId: 'target',
      requestId: 'request',
    };
    await h.audit.list('operator', query);
    expect(h.root.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const where = {
      actorId: 'operator',
      entityType: 'USER',
      entityId: 'target',
      requestId: 'request',
    };
    expect(h.clients[0].auditLog.findMany).toHaveBeenCalledWith({
      where,
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: auditLogSelect,
    });
    expect(h.clients[0].auditLog.count).toHaveBeenCalledWith({ where });
    expect(h.state().logs).toEqual([]);
  });

  it('rejects unmatched entityId, unsafe pagination and direct non-admin reads', async () => {
    const h = harness();
    await expect(
      h.audit.list('operator', {
        ...new ListAuditLogsDto(),
        entityId: 'target',
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      h.audit.list('operator', {
        ...new ListAuditLogsDto(),
        page: Number.MAX_SAFE_INTEGER,
      }),
    ).rejects.toMatchObject({ status: 400 });
    h.state().operator.systemRole = 'USER';
    await expect(
      h.audit.list('operator', new ListAuditLogsDto()),
    ).rejects.toMatchObject({ status: 403 });
  });
});
