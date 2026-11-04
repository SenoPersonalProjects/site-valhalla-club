import { sanctionsHarness } from '../../test/support/sanctions.harness';
import {
  AccountStatus,
  SanctionScopeType,
  SanctionType,
  SystemRole,
} from '../generated/prisma/enums';
import { CreateSanctionDto, SanctionFiltersDto } from './sanctions.dto';

const dto = (extra: Partial<CreateSanctionDto> = {}): CreateSanctionDto => ({
  userId: 'target',
  type: SanctionType.TABLE_CREATION_RESTRICTION,
  scopeType: SanctionScopeType.GENERAL,
  reason: 'PRIVATE_REASON_MARKER',
  endsAt: '2035-01-01T00:00:00Z',
  ...extra,
});

describe('Sanctions service with transactional authorization and audit', () => {
  it.each(['admin', 'dev'])(
    'allows %s and records minimal audit in the same transaction',
    async (actor) => {
      const h = sanctionsHarness();
      const result = await h.service.create(actor, dto(), 'request-1');
      expect(result.createdById).toBe(actor);
      expect(result.isEffective).toBe(true);
      expect(h.state().logs).toEqual([
        expect.objectContaining({
          action: 'SANCTION_CREATED',
          entityType: 'SANCTION',
          entityId: result.id,
          requestId: 'request-1',
          metadata: {
            changed: true,
            type: 'TABLE_CREATION_RESTRICTION',
            scopeType: 'GENERAL',
            hasReport: false,
            hasWarning: false,
          },
        }),
      ]);
      expect(JSON.stringify(h.state().logs)).not.toContain('PRIVATE_REASON');
    },
  );
  it.each(['user', 'club-admin'])(
    'rejects %s even without an HTTP guard',
    async (actor) => {
      const h = sanctionsHarness();
      await expect(h.service.create(actor, dto())).rejects.toMatchObject({
        response: { code: 'ADMIN_ROLE_REQUIRED' },
      });
      expect(h.state()).toEqual({ sanctions: [], logs: [] });
    },
  );
  it.each([
    'PENDING',
    'REJECTED',
    'SUSPENDED',
    'DELETION_PENDING',
    'ANONYMIZED',
  ])('rejects operator account %s', async (status) => {
    const h = sanctionsHarness();
    h.users.get('admin')!.status = status as AccountStatus;
    await expect(h.service.create('admin', dto())).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
  });
  it.each([
    [{ userId: 'missing' }, 'USER_NOT_FOUND'],
    [
      {
        type: SanctionType.TABLE_PARTICIPATION_RESTRICTION,
        scopeType: SanctionScopeType.CAMPAIGN,
        campaignId: 'missing',
      },
      'CAMPAIGN_NOT_FOUND',
    ],
    [
      {
        type: SanctionType.TABLE_PARTICIPATION_RESTRICTION,
        scopeType: SanctionScopeType.SESSION,
        sessionId: 'missing',
      },
      'SESSION_NOT_FOUND',
    ],
    [{ reportId: 'missing' }, 'REPORT_NOT_FOUND'],
    [{ warningId: 'missing' }, 'WARNING_NOT_FOUND'],
  ])('rejects nonexistent origin/scope %j', async (extra, code) => {
    const h = sanctionsHarness();
    await expect(h.service.create('admin', dto(extra))).rejects.toMatchObject({
      response: { code },
    });
    expect(h.state().logs).toHaveLength(0);
  });
  it.each(['OPEN', 'UNDER_REVIEW', 'DISMISSED'])(
    'rejects report %s',
    async (status) => {
      const h = sanctionsHarness();
      h.reports.get('report')!.status = status;
      await expect(
        h.service.create('admin', dto({ reportId: 'report' })),
      ).rejects.toMatchObject({
        response: { code: 'SANCTION_REPORT_NOT_RESOLVED' },
      });
    },
  );
  it('rejects a report of a session', async () => {
    const h = sanctionsHarness();
    h.reports.get('report')!.targetType = 'SESSION';
    await expect(
      h.service.create('admin', dto({ reportId: 'report' })),
    ).rejects.toMatchObject({
      response: { code: 'SANCTION_REPORT_TARGET_INVALID' },
    });
  });
  it('rejects a report for another user', async () => {
    const h = sanctionsHarness();
    h.reports.get('report')!.reportedUserId = 'user';
    await expect(
      h.service.create('admin', dto({ reportId: 'report' })),
    ).rejects.toMatchObject({
      response: { code: 'SANCTION_REPORT_USER_MISMATCH' },
    });
  });
  it('rejects a warning for another user', async () => {
    const h = sanctionsHarness();
    h.warnings.get('warning')!.userId = 'user';
    await expect(
      h.service.create('admin', dto({ warningId: 'warning' })),
    ).rejects.toMatchObject({
      response: { code: 'SANCTION_WARNING_USER_MISMATCH' },
    });
  });
  it('rejects a reversed warning', async () => {
    const h = sanctionsHarness();
    h.warnings.get('warning')!.status = 'REVERSED';
    await expect(
      h.service.create('admin', dto({ warningId: 'warning' })),
    ).rejects.toMatchObject({
      response: { code: 'SANCTION_WARNING_REVERSED' },
    });
  });
  it('requires a common origin when both links are supplied', async () => {
    const h = sanctionsHarness();
    h.warnings.get('warning')!.reportId = null;
    await expect(
      h.service.create(
        'admin',
        dto({ reportId: 'report', warningId: 'warning' }),
      ),
    ).rejects.toMatchObject({ response: { code: 'SANCTION_ORIGIN_MISMATCH' } });
  });
  it.each(['ACTIVE', 'EXPIRED'])(
    'accepts %s warning without changing its historical values',
    async (status) => {
      const h = sanctionsHarness();
      h.warnings.get('warning')!.status = status;
      const before = structuredClone(h.warnings.get('warning'));
      await h.service.create(
        'admin',
        dto({ reportId: 'report', warningId: 'warning' }),
      );
      expect(h.warnings.get('warning')).toEqual(before);
      expect(h.state().logs[0].metadata).toMatchObject({
        hasWarning: true,
        hasReport: true,
      });
    },
  );
  it('blocks equivalent repeated decisions but permits a distinct restriction', async () => {
    const h = sanctionsHarness();
    await h.service.create('admin', dto());
    await expect(h.service.create('admin', dto())).rejects.toMatchObject({
      response: { code: 'SANCTION_ALREADY_EXISTS' },
    });
    await h.service.create(
      'admin',
      dto({ type: SanctionType.MASTER_ACTIVITY_RESTRICTION }),
    );
    expect(h.state().sanctions).toHaveLength(2);
    expect(h.state().logs).toHaveLength(2);
  });
  it.each(['audit', 'commit'])(
    'rolls back creation and audit after %s failure',
    async (kind) => {
      const h = sanctionsHarness();
      if (kind === 'audit') h.failAudit();
      else h.failCommit();
      await expect(h.service.create('admin', dto())).rejects.toThrow();
      expect(h.state()).toEqual({ sanctions: [], logs: [] });
    },
  );
  it('retries the whole operation without audit from aborted attempts', async () => {
    const h = sanctionsHarness();
    h.abort(2);
    await h.service.create('admin', dto());
    expect(h.root.$transaction).toHaveBeenCalledTimes(3);
    expect(h.state().sanctions).toHaveLength(1);
    expect(h.state().logs).toHaveLength(1);
  });
  it('rechecks authorization after a transaction conflict', async () => {
    const h = sanctionsHarness();
    h.abort(1, () => {
      h.users.get('admin')!.systemRole = SystemRole.USER;
    });
    await expect(h.service.create('admin', dto())).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
    expect(h.state().sanctions).toHaveLength(0);
  });
  it('exhausts bounded retries and hides database errors', async () => {
    const h = sanctionsHarness();
    h.abort(3);
    await expect(h.service.create('admin', dto())).rejects.toMatchObject({
      response: { code: 'SANCTION_CONFLICT' },
    });
    expect(h.state().logs).toHaveLength(0);
  });
  it('reads effective status without changing persisted state or recording audit', async () => {
    const h = sanctionsHarness();
    const row = h.fixture({ endsAt: new Date(0) });
    const before = h.state();
    const detail = await h.service.findOne('admin', row.id);
    expect(detail.status).toBe('EXPIRED');
    expect(detail.isEffective).toBe(false);
    expect(h.state()).toEqual(before);
  });
  it('filters effective expiration and omits private detail from lists', async () => {
    const h = sanctionsHarness();
    h.fixture({ endsAt: new Date(0) });
    h.fixture();
    h.fixture({ status: 'REVERSED' });
    const result = await h.service.list(
      'admin',
      Object.assign(new SanctionFiltersDto(), { status: 'EXPIRED' }),
    );
    expect(result.meta.total).toBe(1);
    expect(result.items[0].status).toBe('EXPIRED');
    expect(result.items[0]).not.toHaveProperty('reason');
    expect(result.items[0]).not.toHaveProperty('createdById');
    expect(h.state().logs).toHaveLength(0);
  });
  it('reports a missing sanction without leaking input', async () => {
    const h = sanctionsHarness();
    await expect(h.service.findOne('admin', 'missing')).rejects.toMatchObject({
      response: { code: 'SANCTION_NOT_FOUND' },
    });
  });
});
