import { sanctionsHarness } from '../../test/support/sanctions.harness';
import { assertSanctionAllows } from '../sanctions/sanction-restrictions';
import {
  AccountStatus,
  AppealStatus,
  SanctionType,
  SystemRole,
} from '../generated/prisma/enums';
import {
  AdminAppealFiltersDto,
  CreateAppealDto,
  OwnAppealFiltersDto,
  OwnWarningFiltersDto,
  ReviewAppealDto,
} from './appeals.dto';
import { appealCaseRefs, isAppealUniqueConflict } from './appeals.policy';
import { Prisma } from '../generated/prisma/client';

type Harness = ReturnType<typeof sanctionsHarness>;
const justification = 'PRIVATE_APPEAL_JUSTIFICATION';
const approve: ReviewAppealDto = {
  decision: 'APPROVED',
  response: 'PRIVATE_REVIEW_RESPONSE',
};
const reject: ReviewAppealDto = {
  decision: 'REJECTED',
  response: 'PRIVATE_REVIEW_RESPONSE',
};
const target = (h: Harness, kind: 'WARNING' | 'SANCTION'): CreateAppealDto =>
  kind === 'WARNING'
    ? { warningId: 'warning', justification }
    : { sanctionId: h.fixture().id, justification };

describe('Appeals with ownership, independent decisions and atomic history', () => {
  it.each(['WARNING', 'SANCTION'] as const)(
    'submits %s with server identity and limited audit',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind);
      const result = await h.appealsService.create(
        'target',
        { ...dto, justification: '  ' + justification + '  ' },
        'appeal-request',
      );
      expect(result).toMatchObject({
        userId: 'target',
        sequence: 1,
        status: 'PENDING',
        justification,
      });
      expect('reviewedById' in result).toBe(false);
      expect(h.state().logs[0]).toMatchObject({
        actorId: 'target',
        action: 'APPEAL_SUBMITTED',
        entityId: result.id,
        requestId: 'appeal-request',
        metadata: { changed: true, sequence: 1, targetType: kind },
      });
      expect(JSON.stringify(h.state().logs)).not.toContain('PRIVATE_');
    },
  );

  it.each(['WARNING', 'SANCTION'] as const)(
    'enforces three attempts and only one pending for %s',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind);
      for (let i = 1; i <= 3; i++) {
        const row = await h.appealsService.create('target', dto);
        expect(row.sequence).toBe(i);
        await expect(
          h.appealsService.create('target', dto),
        ).rejects.toMatchObject({ response: { code: 'APPEAL_PENDING' } });
        await h.appealsService.review('dev', row.id, reject);
      }
      await expect(
        h.appealsService.create('target', dto),
      ).rejects.toMatchObject({ response: { code: 'APPEAL_LIMIT_REACHED' } });
      expect(h.appeals()).toHaveLength(3);
      expect(h.appeals().every((row) => row.status === 'REJECTED')).toBe(true);
    },
  );

  it('keeps counters independent for a warning and each of its sanctions', async () => {
    const h = sanctionsHarness();
    for (let i = 0; i < 3; i++) {
      const row = await h.appealsService.create('target', {
        warningId: 'warning',
        justification,
      });
      await h.appealsService.review('dev', row.id, reject);
    }
    for (let i = 0; i < 2; i++) {
      const sanction = h.fixture({ warningId: 'warning' });
      expect(
        (
          await h.appealsService.create('target', {
            sanctionId: sanction.id,
            justification,
          })
        ).sequence,
      ).toBe(1);
    }
    expect(h.appeals()).toHaveLength(5);
  });

  it.each(['WARNING', 'SANCTION'] as const)(
    'does not disclose another owner case for %s',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind);
      await expect(h.appealsService.create('user', dto)).rejects.toMatchObject({
        response: { code: 'APPEAL_CASE_NOT_FOUND' },
      });
      expect(h.appeals()).toHaveLength(0);
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it.each([
    {},
    { warningId: 'warning', sanctionId: 'sanction' },
    { warningId: null },
    { warningId: '' },
    { warningId: ' ' },
    { sanctionId: 'x'.repeat(129) },
    { warningId: 'nul\0' },
  ])('rejects invalid or nonexclusive case references %j', async (refs) => {
    const h = sanctionsHarness();
    await expect(
      h.appealsService.create('target', {
        ...refs,
        justification,
      } as CreateAppealDto),
    ).rejects.toThrow();
    expect(h.appeals()).toHaveLength(0);
  });

  it.each([undefined, null, '', ' ', 1, 'x'.repeat(1001), '\0'])(
    'requires a valid justification %j',
    async (value) => {
      const h = sanctionsHarness();
      await expect(
        h.appealsService.create('target', {
          warningId: 'warning',
          justification: value as string,
        }),
      ).rejects.toThrow();
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it.each(
    Object.values(AccountStatus).filter((s) => s !== AccountStatus.APPROVED),
  )(
    'rejects limited access for lifecycle status %s even without HTTP guard',
    async (status) => {
      const h = sanctionsHarness();
      h.users.get('target')!.status = status;
      await expect(
        h.appealsService.create('target', {
          warningId: 'warning',
          justification,
        }),
      ).rejects.toMatchObject({
        response: { code: 'AUTH_ACCOUNT_UNAVAILABLE' },
      });
      await expect(
        h.appealsService.listOwn('target', new OwnAppealFiltersDto()),
      ).rejects.toThrow();
    },
  );

  it.each(['WARNING', 'SANCTION'] as const)(
    'accepts expired %s but refuses a reversed case',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind);
      if (kind === 'WARNING') {
        h.warnings.get('warning')!.status = 'EXPIRED';
        h.warnings.get('warning')!.expiresAt = new Date(0);
      } else {
        const row = h.state().sanctions[0];
        await h.service.reverse('admin', row.id, { reason: 'Closed' });
      }
      if (kind === 'WARNING')
        expect((await h.appealsService.create('target', dto)).status).toBe(
          'PENDING',
        );
      else
        await expect(
          h.appealsService.create('target', dto),
        ).rejects.toMatchObject({ response: { code: 'APPEAL_CASE_CLOSED' } });
    },
  );

  it('accepts a future sanction and a logically expired ACTIVE sanction', async () => {
    const h = sanctionsHarness();
    for (const extra of [
      { startsAt: new Date('2034-01-01Z') },
      { endsAt: new Date(0) },
      { status: 'EXPIRED' as const },
    ]) {
      const row = h.fixture(extra);
      expect(
        (
          await h.appealsService.create('target', {
            sanctionId: row.id,
            justification,
          })
        ).sequence,
      ).toBe(1);
    }
  });

  it('allows an expelled account to submit without suspending the restriction', async () => {
    const h = sanctionsHarness(),
      row = h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    await h.appealsService.create('target', {
      sanctionId: row.id,
      justification,
    });
    await expect(
      assertSanctionAllows(h.prisma, 'target', 'ACCOUNT'),
    ).rejects.toThrow();
    expect(h.state().sanctions[0].status).toBe('ACTIVE');
  });

  it.each(['WARNING', 'SANCTION'] as const)(
    'approves %s and reverses only the challenged measure atomically',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind);
      const linked = h.fixture({
        warningId: 'warning',
        type: SanctionType.ACCOUNT_SUSPENSION,
      });
      const beforeWarnings = structuredClone(h.warnings);
      const beforeSanctions = h.state().sanctions;
      const appeal = await h.appealsService.create('target', dto);
      const result = await h.appealsService.review(
        'dev',
        appeal.id,
        approve,
        'review-request',
      );
      expect(result).toMatchObject({
        status: 'APPROVED',
        reviewedById: 'dev',
        response: approve.response,
      });
      const logs = h.state().logs;
      expect(logs.map((log) => log.action)).toEqual([
        'APPEAL_SUBMITTED',
        kind + '_REVERSED',
        'APPEAL_REVIEWED',
      ]);
      expect(logs[2]).toMatchObject({
        requestId: 'review-request',
        metadata: {
          changed: true,
          sequence: 1,
          targetType: kind,
          fromStatus: 'PENDING',
          toStatus: 'APPROVED',
        },
      });
      expect(h.state().sanctions.find((row) => row.id === linked.id)).toEqual(
        beforeSanctions.find((row) => row.id === linked.id),
      );
      if (kind === 'WARNING') {
        const warning = h.warnings.get('warning')!;
        expect(warning.status).toBe('REVERSED');
        expect(warning.reversalReason).toBe(approve.response);
        for (const key of [
          'baseWeight',
          'effectiveWeight',
          'recurrenceMultiplier',
          'occurrenceNumber',
          'expiresAt',
          'createdById',
          'reason',
        ] as const)
          expect(warning[key]).toEqual(beforeWarnings.get('warning')![key]);
      } else {
        expect(h.warnings).toEqual(beforeWarnings);
        expect(
          h.state().sanctions.find((row) => row.id === dto.sanctionId)?.status,
        ).toBe('REVERSED');
      }
      await expect(
        h.appealsService.create('target', dto),
      ).rejects.toMatchObject({ response: { code: 'APPEAL_CASE_CLOSED' } });
    },
  );

  it.each(['WARNING', 'SANCTION'] as const)(
    'requires an independent evaluator for %s',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind);
      const appeal = await h.appealsService.create('target', dto);
      await expect(
        h.appealsService.review('admin', appeal.id, approve),
      ).rejects.toMatchObject({
        response: { code: 'APPEAL_INDEPENDENT_REVIEWER_REQUIRED' },
      });
      h.users.get('target')!.systemRole = SystemRole.DEV;
      await expect(
        h.appealsService.review('target', appeal.id, reject),
      ).rejects.toMatchObject({
        response: { code: 'APPEAL_INDEPENDENT_REVIEWER_REQUIRED' },
      });
      expect(h.appeals()[0].status).toBe('PENDING');
    },
  );

  it.each(['user', 'club-admin'])(
    'denies direct administrative review by %s',
    async (actor) => {
      const h = sanctionsHarness(),
        row = h.appealFixture();
      await expect(
        h.appealsService.review(actor, row.id, reject),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_ROLE_REQUIRED' } });
    },
  );

  it('denies a globally sanctioned evaluator', async () => {
    const h = sanctionsHarness(),
      row = h.appealFixture();
    h.fixture({ userId: 'dev', type: SanctionType.EXPULSION, endsAt: null });
    await expect(
      h.appealsService.review('dev', row.id, reject),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_SANCTIONED' } });
  });

  it('preserves a repeated review and rejects an opposite decision', async () => {
    const h = sanctionsHarness(),
      row = h.appealFixture();
    const first = await h.appealsService.review('dev', row.id, reject);
    h.users.get('user')!.systemRole = SystemRole.ADMIN;
    expect(
      await h.appealsService.review('user', row.id, {
        ...reject,
        response: 'Different response',
      }),
    ).toEqual(first);
    expect(h.state().logs[1].metadata).toMatchObject({ changed: false });
    await expect(
      h.appealsService.review('dev', row.id, approve),
    ).rejects.toMatchObject({ response: { code: 'APPEAL_ALREADY_REVIEWED' } });
    expect(h.state().logs).toHaveLength(2);
  });

  it.each([undefined, null, '', ' ', 10, 'x'.repeat(1001), '\0'])(
    'requires a response even when repeating a review: %j',
    async (value) => {
      const h = sanctionsHarness(),
        row = h.appealFixture({ status: 'REJECTED' });
      await expect(
        h.appealsService.review('dev', row.id, {
          ...reject,
          response: value as string,
        }),
      ).rejects.toThrow();
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it('rejects unsupported review decisions and missing appeals', async () => {
    const h = sanctionsHarness(),
      row = h.appealFixture();
    await expect(
      h.appealsService.review('dev', row.id, {
        decision: 'PENDING' as never,
        response: 'Invalid',
      }),
    ).rejects.toThrow();
    await expect(
      h.appealsService.review('dev', 'missing', reject),
    ).rejects.toMatchObject({ response: { code: 'APPEAL_NOT_FOUND' } });
  });

  it.each(['WARNING', 'SANCTION'] as const)(
    'finishes a pending %s appeal without overwriting an earlier manual reversal',
    async (kind) => {
      const h = sanctionsHarness(),
        dto = target(h, kind),
        appeal = await h.appealsService.create('target', dto);
      if (kind === 'WARNING')
        Object.assign(h.warnings.get('warning')!, {
          status: 'REVERSED',
          reversalReason: 'First',
          reversedById: 'admin',
          reversedAt: new Date('2026-01-01Z'),
        });
      else
        await h.service.reverse('admin', dto.sanctionId!, { reason: 'First' });
      await h.appealsService.review('dev', appeal.id, approve);
      const stored =
        kind === 'WARNING'
          ? h.warnings.get('warning')!
          : h.state().sanctions.find((row) => row.id === dto.sanctionId)!;
      expect(stored.reversalReason).toBe('First');
      expect(stored.reversedById).toBe('admin');
      expect(h.appeals()[0].status).toBe('APPROVED');
      expect(h.state().logs.at(-2)?.metadata).toMatchObject({ changed: false });
    },
  );

  it.each(['audit', 'commit'])(
    'rolls back submission after %s failure',
    async (kind) => {
      const h = sanctionsHarness();
      if (kind === 'audit') h.failAudit();
      else h.failCommit();
      await expect(
        h.appealsService.create('target', {
          warningId: 'warning',
          justification,
        }),
      ).rejects.toThrow();
      expect(h.appeals()).toHaveLength(0);
      expect(h.state().logs).toHaveLength(0);
    },
  );

  for (const kind of ['WARNING', 'SANCTION'] as const)
    for (const failure of ['APPEAL_REVIEWED', kind + '_REVERSED', 'commit'])
      it(`rolls back ${kind} and its appeal after ${failure} failure`, async () => {
        const h = sanctionsHarness(),
          dto = target(h, kind),
          row = await h.appealsService.create('target', dto);
        const before = h.state(),
          warnings = structuredClone(h.warnings),
          appeals = h.appeals();
        if (failure === 'commit') h.failCommit();
        else h.failAudit(failure);
        await expect(
          h.appealsService.review('dev', row.id, approve),
        ).rejects.toThrow();
        expect(h.state()).toEqual(before);
        expect(h.appeals()).toEqual(appeals);
        expect(h.warnings).toEqual(warnings);
      });

  it('retries submission and review without aborted records or audit entries', async () => {
    const h = sanctionsHarness();
    h.abort(2);
    const row = await h.appealsService.create('target', {
      warningId: 'warning',
      justification,
    });
    expect(h.appeals()).toHaveLength(1);
    expect(h.state().logs).toHaveLength(1);
    h.abort(2);
    await h.appealsService.review('dev', row.id, approve);
    expect(h.appeals()[0].status).toBe('APPROVED');
    expect(h.state().logs).toHaveLength(3);
  });

  it('rechecks reviewer permissions after a conflict', async () => {
    const h = sanctionsHarness(),
      row = h.appealFixture();
    h.abort(1, () => {
      h.users.get('dev')!.systemRole = SystemRole.USER;
    });
    await expect(
      h.appealsService.review('dev', row.id, approve),
    ).rejects.toThrow();
    expect(h.appeals()[0].status).toBe('PENDING');
    expect(h.warnings.get('warning')!.status).toBe('ACTIVE');
  });

  it('handles a concurrent unique sequence conflict by rereading the pending appeal', async () => {
    const h = sanctionsHarness();
    h.abortUnique(1, () => {
      h.appealFixture();
    });
    await expect(
      h.appealsService.create('target', {
        warningId: 'warning',
        justification,
      }),
    ).rejects.toMatchObject({ response: { code: 'APPEAL_PENDING' } });
    expect(h.appeals()).toHaveLength(1);
    expect(h.state().logs).toHaveLength(0);
  });

  it('does not allocate a fourth sequence after a concurrent third submission', async () => {
    const h = sanctionsHarness();
    h.appealFixture({ sequence: 1, status: 'REJECTED' });
    h.appealFixture({ sequence: 2, status: 'REJECTED' });
    h.abortUnique(1, () => {
      h.appealFixture({ sequence: 3, status: 'PENDING' });
    });
    await expect(
      h.appealsService.create('target', {
        warningId: 'warning',
        justification,
      }),
    ).rejects.toThrow();
    expect(h.appeals()).toHaveLength(3);
  });

  it.each(['serial', 'unique'])(
    'bounds %s retries and returns a safe conflict',
    async (kind) => {
      const h = sanctionsHarness();
      if (kind === 'serial') h.abort(3);
      else h.abortUnique(3);
      await expect(
        h.appealsService.create('target', {
          warningId: 'warning',
          justification,
        }),
      ).rejects.toMatchObject({ response: { code: 'APPEAL_CONFLICT' } });
      expect(h.root.$transaction).toHaveBeenCalledTimes(3);
      expect(h.appeals()).toHaveLength(0);
    },
  );

  it('isolates owner queries and omits private fields from summaries', async () => {
    const h = sanctionsHarness(),
      own = h.appealFixture();
    h.appealFixture({ userId: 'user' });
    const query = Object.assign(new OwnAppealFiltersDto(), { userId: 'user' });
    const list = await h.appealsService.listOwn('target', query);
    expect(list.meta.total).toBe(1);
    expect(list.items[0].id).toBe(own.id);
    expect('justification' in list.items[0]).toBe(false);
    expect('response' in list.items[0]).toBe(false);
    const detail = await h.appealsService.findOwn('target', own.id);
    expect(detail.justification).toBe('PRIVATE_JUSTIFICATION');
    expect('reviewedById' in detail).toBe(false);
    await expect(
      h.appealsService.findOwn('admin', own.id),
    ).rejects.toMatchObject({ response: { code: 'APPEAL_NOT_FOUND' } });
  });

  it('supports administrative filters with current-role authorization and a consistent snapshot', async () => {
    const h = sanctionsHarness();
    h.appealFixture();
    h.appealFixture({ userId: 'user' });
    const query = Object.assign(new AdminAppealFiltersDto(), {
      userId: 'target',
      status: AppealStatus.PENDING,
    });
    expect((await h.appealsService.listAdmin('dev', query)).meta.total).toBe(1);
    expect(await h.appealsService.findAdmin('dev', 'appeal-0')).toHaveProperty(
      'reviewedById',
    );
    expect(h.root.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    await expect(
      h.appealsService.listAdmin('club-admin', query),
    ).rejects.toThrow();
  });

  it('lets a sanctioned owner read only pertinent warning data with temporal status', async () => {
    const h = sanctionsHarness();
    h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    h.warnings.get('warning')!.expiresAt = new Date(0);
    const list = await h.appealsService.listWarningsOwn(
      'target',
      Object.assign(new OwnWarningFiltersDto(), { status: 'EXPIRED' }),
    );
    expect(list.meta.total).toBe(1);
    expect(list.items[0]).toMatchObject({
      status: 'EXPIRED',
      isEffective: false,
    });
    expect('reason' in list.items[0]).toBe(false);
    const detail = await h.appealsService.findWarningOwn('target', 'warning');
    for (const key of ['reportId', 'createdById', 'reversedById'])
      expect(key in detail).toBe(false);
    await expect(
      h.appealsService.findWarningOwn('user', 'warning'),
    ).rejects.toMatchObject({ response: { code: 'WARNING_NOT_FOUND' } });
    expect(h.state().logs).toHaveLength(0);
  });

  it('rejects incompatible filters and excessive pagination', async () => {
    const h = sanctionsHarness();
    for (const extra of [
      { warningId: 'warning', sanctionId: 'x' },
      { status: 'UNKNOWN' },
      { page: Number.MAX_SAFE_INTEGER },
    ])
      await expect(
        h.appealsService.listOwn(
          'target',
          Object.assign(new OwnAppealFiltersDto(), extra),
        ),
      ).rejects.toThrow();
  });

  it('recognizes only unique conflicts eligible for submission retry', () => {
    expect(
      isAppealUniqueConflict(
        new Prisma.PrismaClientKnownRequestError('private', {
          code: 'P2002',
          clientVersion: '7',
        }),
      ),
    ).toBe(true);
    const raw = new Error('private', {
      cause: { kind: 'UniqueConstraintViolation' },
    });
    raw.name = 'DriverAdapterError';
    expect(isAppealUniqueConflict(raw)).toBe(true);
    expect(isAppealUniqueConflict(new Error('P2002'))).toBe(false);
    expect(isAppealUniqueConflict(null)).toBe(false);
    expect(() => appealCaseRefs({})).toThrow();
  });
});
