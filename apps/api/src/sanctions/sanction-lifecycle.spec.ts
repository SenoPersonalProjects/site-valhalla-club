import { sanctionsHarness } from '../../test/support/sanctions.harness';
import {
  AccountStatus,
  SanctionStatus,
  SanctionType,
  SystemRole,
} from '../generated/prisma/enums';
import { assertSanctionAllows } from './sanction-restrictions';
import { SANCTION_EXPIRATION_BATCH_SIZE } from './sanctions.constants';

describe('Sanction reversal and expiration with transactional history', () => {
  const now = new Date('2026-11-04T12:00:00Z');
  const reason = { reason: '  PRIVATE_REVERSAL_MARKER  ' };

  it.each(['admin', 'dev'])(
    'allows approved %s to reverse with minimal audit',
    async (actor) => {
      const h = sanctionsHarness();
      const row = h.fixture({ reportId: 'report', warningId: 'warning' });
      const before = structuredClone(row);
      const result = await h.service.reverse(
        actor,
        row.id,
        reason,
        'reverse-request',
      );
      expect(result).toMatchObject({
        status: 'REVERSED',
        isEffective: false,
        reversedById: actor,
        reversalReason: 'PRIVATE_REVERSAL_MARKER',
      });
      expect(result.reversedAt).toBeInstanceOf(Date);
      for (const field of [
        'id',
        'userId',
        'type',
        'scopeType',
        'campaignId',
        'sessionId',
        'scopeDescription',
        'reportId',
        'warningId',
        'reason',
        'startsAt',
        'endsAt',
        'createdAt',
        'createdById',
      ] as const)
        expect(result[field]).toEqual(before[field]);
      expect(h.state().logs).toEqual([
        expect.objectContaining({
          actorId: actor,
          action: 'SANCTION_REVERSED',
          entityType: 'SANCTION',
          entityId: row.id,
          requestId: 'reverse-request',
          metadata: {
            changed: true,
            fromStatus: 'ACTIVE',
            toStatus: 'REVERSED',
          },
        }),
      ]);
      expect(JSON.stringify(h.state().logs)).not.toContain('PRIVATE_');
      expect(h.root.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
    },
  );

  it.each([
    { status: SanctionStatus.EXPIRED },
    { startsAt: new Date('2034-01-01Z') },
    { endsAt: new Date(0) },
    { type: SanctionType.EXPULSION, endsAt: null },
  ])(
    'can reverse expired, future or indefinite decisions %j',
    async (extra) => {
      const h = sanctionsHarness();
      const row = h.fixture(extra);
      expect(await h.service.reverse('admin', row.id, reason)).toMatchObject({
        status: 'REVERSED',
        isEffective: false,
      });
    },
  );

  it('preserves the first reversal, including updatedAt, on a repeated decision by DEV', async () => {
    const h = sanctionsHarness();
    const row = h.fixture();
    const first = await h.service.reverse('admin', row.id, reason);
    expect(
      await h.service.reverse('dev', row.id, { reason: 'Different reason' }),
    ).toEqual(first);
    expect(h.state().logs).toHaveLength(2);
    expect(h.state().logs[1]).toMatchObject({
      actorId: 'dev',
      metadata: {
        changed: false,
        fromStatus: 'REVERSED',
        toStatus: 'REVERSED',
      },
    });
    expect(h.transactions[1].sanction.updateMany).not.toHaveBeenCalled();
  });

  it.each([undefined, null, '', '  ', 123, 'x'.repeat(1001), 'with\0nul'])(
    'requires a valid reason even when already reversed: %j',
    async (value) => {
      const h = sanctionsHarness();
      const row = h.fixture({ status: SanctionStatus.REVERSED });
      await expect(
        h.service.reverse('admin', row.id, { reason: value as string }),
      ).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it.each(['user', 'club-admin'])(
    'denies direct reversal by %s without HTTP guards',
    async (actor) => {
      const h = sanctionsHarness();
      const row = h.fixture();
      await expect(
        h.service.reverse(actor, row.id, reason),
      ).rejects.toMatchObject({
        response: { code: 'ADMIN_ROLE_REQUIRED' },
      });
      expect(h.state().sanctions[0].status).toBe('ACTIVE');
      expect(h.state().logs).toHaveLength(0);
    },
  );

  it.each(
    Object.values(AccountStatus).filter((s) => s !== AccountStatus.APPROVED),
  )('denies reversal by an administrator with account %s', async (status) => {
    const h = sanctionsHarness();
    const row = h.fixture();
    h.users.get('admin')!.status = status;
    await expect(
      h.service.reverse('admin', row.id, reason),
    ).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
    expect(h.state().logs).toHaveLength(0);
  });

  it('denies a globally sanctioned administrator', async () => {
    const h = sanctionsHarness();
    const row = h.fixture();
    h.fixture({ userId: 'admin', type: SanctionType.EXPULSION, endsAt: null });
    await expect(
      h.service.reverse('admin', row.id, reason),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_SANCTIONED' },
    });
    expect(h.state().logs).toHaveLength(0);
  });

  it('returns not found without recording an event', async () => {
    const h = sanctionsHarness();
    await expect(
      h.service.reverse('admin', 'missing', reason),
    ).rejects.toMatchObject({
      response: { code: 'SANCTION_NOT_FOUND' },
    });
    expect(h.state().logs).toHaveLength(0);
  });

  it.each(['audit', 'commit'])(
    'rolls back reversal and audit after %s failure',
    async (kind) => {
      const h = sanctionsHarness();
      h.fixture();
      const before = h.state();
      if (kind === 'audit') h.failAudit();
      else h.failCommit();
      await expect(
        h.service.reverse('admin', before.sanctions[0].id, reason),
      ).rejects.toThrow();
      expect(h.state()).toEqual(before);
    },
  );

  it('retries reversal without leaving aborted audit entries', async () => {
    const h = sanctionsHarness();
    const row = h.fixture();
    h.abort(2);
    await h.service.reverse('admin', row.id, reason);
    expect(h.root.$transaction).toHaveBeenCalledTimes(3);
    expect(h.state().logs).toHaveLength(1);
  });

  it('rechecks current administrator permissions after conflict', async () => {
    const h = sanctionsHarness();
    const row = h.fixture();
    h.abort(1, () => {
      h.users.get('admin')!.systemRole = SystemRole.USER;
    });
    await expect(
      h.service.reverse('admin', row.id, reason),
    ).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
    expect(h.state().sanctions[0].status).toBe('ACTIVE');
    expect(h.state().logs).toHaveLength(0);
  });

  it('preserves a concurrent first reversal when retrying', async () => {
    const h = sanctionsHarness();
    const row = h.fixture();
    const first = {
      status: SanctionStatus.REVERSED,
      reversedById: 'dev',
      reversedAt: new Date('2026-11-01Z'),
      reversalReason: 'First decision',
    };
    h.abort(1, () => {
      Object.assign(row, first);
    });
    expect(await h.service.reverse('admin', row.id, reason)).toMatchObject(
      first,
    );
    expect(h.state().logs[0].metadata).toEqual({
      changed: false,
      fromStatus: 'REVERSED',
      toStatus: 'REVERSED',
    });
  });

  it('bounds retries and does not leak driver messages', async () => {
    const h = sanctionsHarness();
    const row = h.fixture();
    h.abort(3);
    await expect(
      h.service.reverse('admin', row.id, reason),
    ).rejects.toMatchObject({
      response: { code: 'SANCTION_CONFLICT' },
    });
    expect(h.root.$transaction).toHaveBeenCalledTimes(3);
    expect(h.state().logs).toHaveLength(0);
  });

  it('only removes the reversed restriction and preserves antecedents and account state', async () => {
    const h = sanctionsHarness();
    const row = h.fixture({ type: SanctionType.ACCOUNT_SUSPENSION });
    const second = h.fixture({ type: SanctionType.EXPULSION, endsAt: null });
    const users = structuredClone(h.users);
    const warnings = structuredClone(h.warnings);
    await h.service.reverse('admin', row.id, reason);
    await expect(
      assertSanctionAllows(h.prisma, 'target', 'ACCOUNT'),
    ).rejects.toMatchObject({
      response: { code: 'ACCOUNT_SANCTIONED' },
    });
    await h.service.reverse('dev', second.id, reason);
    await expect(
      assertSanctionAllows(h.prisma, 'target', 'ACCOUNT'),
    ).resolves.toBeUndefined();
    expect(h.users).toEqual(users);
    expect(h.warnings).toEqual(warnings);
  });

  it('expires due records at the exact boundary, preserving original values', async () => {
    const h = sanctionsHarness();
    const before = h.fixture({
      endsAt: new Date(now.getTime() - 1),
      reportId: 'report',
    });
    const exact = h.fixture({ endsAt: now });
    const future = h.fixture({ endsAt: new Date(now.getTime() + 1) });
    const scheduled = h.fixture({ startsAt: new Date('2030-01-01Z') });
    const indefinite = h.fixture({
      type: SanctionType.EXPULSION,
      endsAt: null,
    });
    const reversed = h.fixture({
      status: SanctionStatus.REVERSED,
      endsAt: new Date(0),
    });
    const expired = h.fixture({
      status: SanctionStatus.EXPIRED,
      endsAt: new Date(0),
    });
    const snapshot = h.state();
    expect(await h.service.expireDue(now)).toEqual({ count: 2 });
    const after = h.state();
    for (const row of [before, exact]) {
      const updated = after.sanctions.find((s) => s.id === row.id)!;
      expect(JSON.stringify(updated)).toBe(
        JSON.stringify({
          ...row,
          status: 'EXPIRED',
          updatedAt: updated.updatedAt,
        }),
      );
      expect(Number.isFinite(updated.updatedAt.getTime())).toBe(true);
    }
    for (const row of [future, scheduled, indefinite, reversed, expired])
      expect(after.sanctions.find((s) => s.id === row.id)).toEqual(
        snapshot.sanctions.find((s) => s.id === row.id),
      );
    expect(after.logs).toHaveLength(2);
    for (const log of after.logs)
      expect(log).toMatchObject({
        actorId: null,
        requestId: null,
        action: 'SANCTION_EXPIRED',
        entityType: 'SANCTION',
        metadata: { changed: true, fromStatus: 'ACTIVE', toStatus: 'EXPIRED' },
      });
    expect(await h.service.expireDue(now)).toEqual({ count: 0 });
    expect(h.state().logs).toHaveLength(2);
  });

  it('processes a bounded backlog over successive batches without losing records', async () => {
    const h = sanctionsHarness();
    for (let i = 0; i < SANCTION_EXPIRATION_BATCH_SIZE + 2; i++)
      h.fixture({ endsAt: new Date(0) });
    expect(await h.service.expireDue(now)).toEqual({
      count: SANCTION_EXPIRATION_BATCH_SIZE,
    });
    expect(await h.service.expireDue(now)).toEqual({ count: 2 });
    expect(await h.service.expireDue(now)).toEqual({ count: 0 });
    expect(h.state().logs).toHaveLength(SANCTION_EXPIRATION_BATCH_SIZE + 2);
  });

  it.each(['audit', 'commit'])(
    'rolls back an expiration batch after %s failure',
    async (kind) => {
      const h = sanctionsHarness();
      h.fixture({ endsAt: new Date(0) });
      const before = h.state();
      if (kind === 'audit') h.failAudit();
      else h.failCommit();
      await expect(h.service.expireDue(now)).rejects.toThrow();
      expect(h.state()).toEqual(before);
    },
  );

  it('retries expiration and commits only one event per expired record', async () => {
    const h = sanctionsHarness();
    h.fixture({ endsAt: new Date(0) });
    h.abort(2);
    expect(await h.service.expireDue(now)).toEqual({ count: 1 });
    expect(h.state().logs).toHaveLength(1);
  });

  it('does not overwrite a reversal that wins before an expiration retry', async () => {
    const h = sanctionsHarness();
    const row = h.fixture({ endsAt: new Date(0) });
    h.abort(1, () => {
      row.status = SanctionStatus.REVERSED;
      row.reversalReason = 'Retained';
    });
    expect(await h.service.expireDue(now)).toEqual({ count: 0 });
    expect(h.state().sanctions[0].reversalReason).toBe('Retained');
    expect(h.state().logs).toHaveLength(0);
  });

  it('rejects an invalid internal reference without opening a transaction', () => {
    const h = sanctionsHarness();
    expect(() => h.service.expireDue(new Date(NaN))).toThrow();
    expect(h.root.$transaction).not.toHaveBeenCalled();
  });
});
