import { warningsHarness } from '../../test/support/warnings.harness';
import { Prisma } from '../generated/prisma/client';
import {
  ReportStatus,
  ReportTargetType,
  SystemRole,
  WarningSeverity,
  WarningStatus,
} from '../generated/prisma/enums';
import { CreateWarningDto } from './warnings.dto';
import { warningReportSelect } from './warning-report';

const input = (): CreateWarningDto => ({
  userId: 'target',
  categoryId: 'respect',
  reportId: 'resolved-report',
  severity: WarningSeverity.MODERATE,
  reason: 'Explicit administrative decision',
});

describe('Warning report eligibility and atomic creation', () => {
  it.each(['admin', 'dev'])(
    'accepts eligible report for %s without reading private content or modifying the report',
    async (actor) => {
      const h = warningsHarness();
      const before = structuredClone(h.reports);
      const result = await h.service.create(
        actor,
        input(),
        'report-warning-001',
      );
      expect(result.reportId).toBe('resolved-report');
      expect(result.reason).toBe('Explicit administrative decision');
      expect(result.effectiveWeight.toString()).toBe('3');
      expect(result.createdById).toBe(actor);
      expect(h.reports).toEqual(before);
      expect(h.clients[0].report.findUnique.mock.calls[0][0]).toEqual({
        where: { id: 'resolved-report' },
        select: warningReportSelect,
      });
      expect(Object.keys(warningReportSelect).sort()).toEqual([
        'categoryId',
        'reportedUserId',
        'status',
        'targetType',
      ]);
      expect(h.state().audits[0]).toMatchObject({
        action: 'WARNING_CREATED',
        requestId: 'report-warning-001',
        metadata: { changed: true, hasReport: true },
      });
      for (const privateField of [
        'description',
        'authorId',
        'resolutionNote',
        'evidences',
        'report',
      ])
        expect(result).not.toHaveProperty(privateField);
      expect(h.outside).not.toHaveBeenCalled();
    },
  );
  it.each([
    ReportStatus.OPEN,
    ReportStatus.UNDER_REVIEW,
    ReportStatus.DISMISSED,
  ])('rejects report status %s without a warning or audit', async (status) => {
    const h = warningsHarness();
    h.reports[0].status = status;
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      status: 409,
      response: { code: 'WARNING_REPORT_NOT_RESOLVED' },
    });
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it('rejects an unknown report', async () => {
    const h = warningsHarness();
    await expect(
      h.service.create('admin', { ...input(), reportId: 'missing' }),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'REPORT_NOT_FOUND' },
    });
    expect(h.state().warnings).toHaveLength(0);
  });
  it.each([ReportTargetType.SESSION, ReportTargetType.USER])(
    'rejects invalid individual target for type %s',
    async (type) => {
      const h = warningsHarness();
      h.reports[0].targetType = type;
      h.reports[0].reportedUserId = null;
      await expect(h.service.create('admin', input())).rejects.toMatchObject({
        status: 409,
        response: { code: 'WARNING_REPORT_TARGET_INVALID' },
      });
      expect(h.state().audits).toHaveLength(0);
    },
  );
  it.each([
    [{ userId: 'user' }, 'WARNING_REPORT_USER_MISMATCH'],
    [{ categoryId: 'other' }, 'WARNING_REPORT_CATEGORY_MISMATCH'],
  ] as const)('requires report correspondence %j', async (extra, code) => {
    const h = warningsHarness();
    await expect(
      h.service.create('admin', { ...input(), ...extra }),
    ).rejects.toMatchObject({ status: 409, response: { code } });
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it('still requires an active category and an explicit explanation with a resolved report', async () => {
    const h = warningsHarness();
    h.categories[0].active = false;
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      response: { code: 'DISCIPLINARY_CATEGORY_INACTIVE' },
    });
    h.categories[0].active = true;
    await expect(
      h.service.create('admin', { ...input(), reason: ' ' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it.each([
    WarningStatus.ACTIVE,
    WarningStatus.EXPIRED,
    WarningStatus.REVERSED,
  ])('never reuses a report whose warning is %s', async (status) => {
    const h = warningsHarness();
    const original = h.fixture({ reportId: 'resolved-report', status });
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      status: 409,
      response: { code: 'WARNING_REPORT_ALREADY_USED' },
    });
    expect(h.state().warnings).toEqual([original]);
    expect(h.state().audits).toHaveLength(0);
    expect(h.clients[0].warning.findUnique.mock.calls[0][0]).toEqual({
      where: { reportId: 'resolved-report' },
      select: { id: true },
    });
  });
  it('treats overdue ACTIVE history as used without silently releasing the report', async () => {
    const h = warningsHarness();
    h.fixture({ reportId: 'resolved-report', expiresAt: new Date(0) });
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      response: { code: 'WARNING_REPORT_ALREADY_USED' },
    });
  });
  it('keeps direct creation independent from the report repository', async () => {
    const h = warningsHarness();
    const data = input();
    delete data.reportId;
    const result = await h.service.create('admin', data);
    expect(result.reportId).toBeNull();
    expect(h.clients[0].report.findUnique).not.toHaveBeenCalled();
    expect(h.state().audits[0].metadata).toEqual({
      changed: true,
      hasReport: false,
    });
  });
  it.each(['user', 'master', 'club-admin'])(
    'denies %s before reading any report',
    async (actor) => {
      const h = warningsHarness();
      await expect(h.service.create(actor, input())).rejects.toMatchObject({
        status: 403,
      });
      expect(h.clients[0].report.findUnique).not.toHaveBeenCalled();
    },
  );
  it.each(['auditFails', 'commitFails'] as const)(
    'does not consume the report when %s',
    async (fault) => {
      const h = warningsHarness();
      h.control[fault] = true;
      await expect(h.service.create('admin', input())).rejects.toThrow(
        'Synthetic',
      );
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
      h.control[fault] = false;
      expect((await h.service.create('admin', input())).reportId).toBe(
        'resolved-report',
      );
    },
  );
  it.each([false, true])(
    'revalidates report eligibility after aborted attempt (adapter=%s)',
    async (adapter) => {
      const h = warningsHarness();
      h.control.aborts = 1;
      h.control.adapterAborts = adapter;
      h.control.afterAbort = () => {
        h.reports[0].status = ReportStatus.DISMISSED;
      };
      await expect(h.service.create('admin', input())).rejects.toMatchObject({
        response: { code: 'WARNING_REPORT_NOT_RESOLVED' },
      });
      expect(h.state().warnings).toHaveLength(0);
      expect(h.state().audits).toHaveLength(0);
      expect(h.clients).toHaveLength(2);
      for (const tx of h.clients)
        expect(tx.report.findUnique).toHaveBeenCalledTimes(1);
    },
  );
  it('rechecks role and report reuse after a serialization retry', async () => {
    const h = warningsHarness();
    h.control.aborts = 1;
    h.control.afterAbort = () => {
      h.fixture({ reportId: 'resolved-report' });
    };
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      response: { code: 'WARNING_REPORT_ALREADY_USED' },
    });
    expect(h.state().warnings).toHaveLength(1);
    expect(h.state().audits).toHaveLength(0);
    const other = warningsHarness();
    other.control.aborts = 1;
    other.control.afterAbort = () => {
      other.users.admin.systemRole = SystemRole.USER;
    };
    await expect(other.service.create('admin', input())).rejects.toMatchObject({
      status: 403,
    });
    expect(other.clients[1].report.findUnique).not.toHaveBeenCalled();
  });
  it('maps a report unique conflict without retrying or leaving partial records', async () => {
    const h = warningsHarness();
    h.control.mutationError = new Prisma.PrismaClientKnownRequestError(
      'private SQL and constraint',
      {
        code: 'P2002',
        clientVersion: '7',
        meta: { modelName: 'Warning', target: ['reportId'] },
      },
    );
    await expect(h.service.create('admin', input())).rejects.toMatchObject({
      status: 409,
      response: { code: 'WARNING_REPORT_ALREADY_USED' },
    });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.state().warnings).toHaveLength(0);
    expect(h.state().audits).toHaveLength(0);
  });
  it('does not mislabel unrelated unique or direct-creation failures as report reuse', async () => {
    const h = warningsHarness();
    const data = input();
    delete data.reportId;
    const error = new Prisma.PrismaClientKnownRequestError(
      'private unrelated constraint',
      {
        code: 'P2002',
        clientVersion: '7',
        meta: { modelName: 'Warning', target: ['id'] },
      },
    );
    h.control.mutationError = error;
    await expect(h.service.create('admin', input())).rejects.toBe(error);
    await expect(h.service.create('admin', data)).rejects.toBe(error);
  });
});
