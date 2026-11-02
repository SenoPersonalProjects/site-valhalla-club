import { participationHarness } from '../../test/support/participation-harness';
import {
  AccountStatus,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionStatus,
  OneShotStatus,
} from '../generated/prisma/enums';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AUDIT_ACTION } from '../audit/audit.constants';
import { TablesService } from '../tables/tables.service';
import { TableActorsService } from '../tables/table-actors.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

const attended = { status: SessionParticipantStatus.ATTENDED } as const;
const absent = { status: SessionParticipantStatus.NO_SHOW } as const;

describe('Participation and attendance', () => {
  it.each(['cancellation', 'correction'] as const)(
    'rejects NUL in %s reason without persisting changes',
    async (operation) => {
      const h = participationHarness();
      await h.participation.add('session', 'master', 'player');
      if (operation === 'correction') {
        await h.participation.recordAttendance(
          'session',
          'player',
          'master',
          attended,
        );
        await h.sessions.changeStatus('session', 'master', {
          status: SessionStatus.COMPLETED,
        });
      }
      const before = structuredClone(h.state());
      const result =
        operation === 'cancellation'
          ? h.participation.cancel(
              'session',
              'player',
              'master',
              'Invalid\u0000reason',
            )
          : h.participation.recordAttendance('session', 'player', 'admin', {
              ...absent,
              reason: 'Invalid\u0000reason',
            });
      await expect(result).rejects.toMatchObject({
        status: 400,
        response: { code: 'PARTICIPATION_REASON_REQUIRED' },
      });
      expect(h.state()).toEqual(before);
    },
  );

  it.each([1000, 1001])(
    'counts %s Unicode characters consistently with the HTTP validator',
    async (size) => {
      const h = participationHarness();
      await h.participation.add('session', 'master', 'player');
      const result = h.participation.cancel(
        'session',
        'player',
        'master',
        '😀'.repeat(size),
      );
      if (size === 1000) {
        await result;
        expect(h.state().participants[0].cancellationReason).toBe(
          '😀'.repeat(size),
        );
        expect(JSON.stringify(h.state().audits)).not.toContain('😀');
      } else await expect(result).rejects.toMatchObject({ status: 400 });
    },
  );

  it('returns a domain conflict if master participation is concurrently inserted', async () => {
    const h = participationHarness();
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      'Private constraint',
      {
        code: 'P2002',
        clientVersion: '7.10.1',
      },
    );
    const tx = {
      sessionParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockRejectedValue(duplicate),
      },
    } as unknown as Prisma.TransactionClient;
    await expect(
      h.participation.complete(tx, 'session', 'master', 'master'),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_MASTER_PARTICIPATION_CONFLICT' },
    });
    expect(h.state().audits).toEqual([]);
  });

  it.each(['attendance', 'cancellation', 'completion'] as const)(
    'rolls back %s when audit persistence fails',
    async (operation) => {
      const h = participationHarness();
      await h.participation.add('session', 'master', 'player');
      if (operation === 'completion')
        await h.participation.recordAttendance(
          'session',
          'player',
          'master',
          attended,
        );
      const before = structuredClone(h.state());
      h.failAudit();
      const result =
        operation === 'attendance'
          ? h.participation.recordAttendance(
              'session',
              'player',
              'master',
              attended,
            )
          : operation === 'cancellation'
            ? h.participation.cancel(
                'session',
                'player',
                'master',
                'Private reason',
              )
            : h.sessions.changeStatus('session', 'master', {
                status: SessionStatus.COMPLETED,
              });
      await expect(result).rejects.toThrow('Synthetic audit failure');
      expect(h.state()).toEqual(before);
    },
  );

  it.each(['unexpected-master', 'owner-as-player', 'absent-master'] as const)(
    'rejects incompatible legacy master participation: %s',
    async (scenario) => {
      const h = participationHarness();
      await h.participation.add('session', 'master', 'player');
      await h.participation.recordAttendance(
        'session',
        'player',
        'master',
        attended,
      );
      const row = h.state().participants[0];
      row.role =
        scenario === 'owner-as-player'
          ? SessionParticipantRole.PLAYER
          : SessionParticipantRole.MASTER;
      row.userId = scenario === 'unexpected-master' ? 'other' : 'master';
      if (scenario === 'absent-master')
        row.status = SessionParticipantStatus.NO_SHOW;
      await expect(
        h.sessions.changeStatus('session', 'master', {
          status: SessionStatus.COMPLETED,
        }),
      ).rejects.toMatchObject({
        response: { code: 'SESSION_MASTER_PARTICIPATION_CONFLICT' },
      });
      expect(h.state().session.status).toBe('SCHEDULED');
    },
  );
  it('does not select the new administrative correction reason in tables/me', async () => {
    let projection: Record<string, unknown> = {};
    const findMany = jest.fn((args: { select: Record<string, unknown> }) => {
      projection = args.select;
      return Promise.resolve([]);
    });
    const prisma = {
      campaign: { findMany: jest.fn().mockResolvedValue([]) },
      oneShot: { findMany: jest.fn().mockResolvedValue([]) },
      sessionParticipant: { findMany },
    } as unknown as PrismaService;
    const service = new TablesService(prisma, {
      assertUserExists: jest.fn().mockResolvedValue(undefined),
    } as unknown as TableActorsService);
    await service.findForUser('player');
    expect(projection).toMatchObject({ status: true, attendedAt: true });
    expect(projection).toHaveProperty('session');
    expect(projection).not.toHaveProperty('attendanceCorrectionReason');
  });
  it('registers an approved player without granting roles or presence, with minimal projection and atomic audit', async () => {
    const h = participationHarness();
    const result = await h.participation.add(
      'session',
      'master',
      'player',
      'request-1',
    );
    expect(result).toMatchObject({
      userId: 'player',
      status: 'REGISTERED',
      role: 'PLAYER',
      attendedAt: null,
      user: { profile: { displayName: 'player' } },
    });
    expect(JSON.stringify(result)).not.toContain('private-phone');
    expect(h.state().users.player.clubRoles).toEqual([]);
    expect(h.state().audits).toMatchObject([
      {
        action: AUDIT_ACTION.SESSION_PARTICIPANT_ADDED,
        requestId: 'request-1',
        actorId: 'master',
      },
    ]);
    expect(h.outside).not.toHaveBeenCalled();
  });

  it.each(['other', 'player', 'club-admin'])(
    'denies adding participants as unrelated %s',
    async (actor) => {
      const h = participationHarness();
      await expect(
        h.participation.add('session', actor, 'player'),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_ROLE_REQUIRED' } });
      expect(h.state().participants).toEqual([]);
      expect(h.state().audits).toEqual([]);
    },
  );

  it('permits ADMIN and denies pending target accounts and manual master registration', async () => {
    const h = participationHarness();
    h.state().users.player.status = AccountStatus.PENDING;
    await expect(
      h.participation.add('session', 'admin', 'player'),
    ).rejects.toMatchObject({
      response: { code: 'PARTICIPANT_ACCOUNT_NOT_APPROVED' },
    });
    await expect(
      h.participation.add('session', 'admin', 'master'),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_MASTER_PARTICIPATION' },
    });
    await h.participation.add('session', 'admin', 'other');
    expect(h.state().participants).toHaveLength(1);
  });

  it.each([SessionStatus.CANCELLED, SessionStatus.COMPLETED])(
    'blocks additions in %s sessions',
    async (status) => {
      const h = participationHarness();
      h.state().session.status = status;
      await expect(
        h.participation.add('session', 'master', 'player'),
      ).rejects.toMatchObject({ response: { code: 'SESSION_CLOSED' } });
    },
  );

  it('rejects missing sessions and users', async () => {
    const h = participationHarness();
    await expect(
      h.participation.add('missing', 'master', 'player'),
    ).rejects.toMatchObject({ response: { code: 'SESSION_NOT_FOUND' } });
    await expect(
      h.participation.add('session', 'master', 'missing'),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
  });

  it('keeps one participation under concurrent additions and reports a domain conflict', async () => {
    const h = participationHarness();
    const results = await Promise.allSettled([
      h.participation.add('session', 'master', 'player'),
      h.participation.add('session', 'master', 'player'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'PARTICIPANT_ALREADY_REGISTERED' } },
    });
    expect(h.state().participants).toHaveLength(1);
    expect(h.state().audits).toHaveLength(1);
  });

  it('lists only the selected fields with deterministic pagination and no write', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    const result = await h.participation.list(
      'session',
      'master',
      new PaginationQueryDto(),
    );
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, pages: 1 });
    expect(JSON.stringify(result)).not.toMatch(
      /private-phone|birthDate|attendanceCorrectionReason|cancellationReason/,
    );
    expect(h.state().audits).toHaveLength(1);
    expect(h.clients.at(-1)?.sessionParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
      }),
    );
    await expect(
      h.participation.list('session', 'player', new PaginationQueryDto()),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_ROLE_REQUIRED' } });
    await expect(
      h.participation.list('session', 'master', {
        page: Number.MAX_SAFE_INTEGER,
        limit: 50,
      }),
    ).rejects.toMatchObject({ response: { code: 'BAD_REQUEST' } });
  });

  it('blocks attendance before the scheduled time and records attendance at the exact boundary', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    jest.useFakeTimers().setSystemTime(new Date('2026-11-02T12:00:00Z'));
    try {
      h.state().session.scheduledAt = new Date(Date.now() + 1);
      await expect(
        h.participation.recordAttendance(
          'session',
          'player',
          'master',
          attended,
        ),
      ).rejects.toMatchObject({ response: { code: 'SESSION_NOT_STARTED' } });
      h.state().session.scheduledAt = new Date();
      await h.participation.recordAttendance(
        'session',
        'player',
        'master',
        attended,
      );
      expect(h.state().participants[0].attendedAt).toEqual(new Date());
    } finally {
      jest.useRealTimers();
    }
  });

  it('preserves attendance time on repetition, audits no-op, and clears attendance time for NO_SHOW', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    await h.participation.recordAttendance(
      'session',
      'player',
      'master',
      attended,
    );
    const time = h.state().participants[0].attendedAt;
    await h.participation.recordAttendance(
      'session',
      'player',
      'master',
      attended,
    );
    expect(h.state().participants[0].attendedAt).toEqual(time);
    expect(h.state().audits.at(-1)?.metadata.changed).toBe(false);
    expect(h.clients.at(-1)?.sessionParticipant.update).not.toHaveBeenCalled();
    await h.participation.recordAttendance(
      'session',
      'player',
      'master',
      absent,
    );
    expect(h.state().participants[0].attendedAt).toBeNull();
  });

  it('keeps cancellation idempotent and never turns a cancelled player into attendance or absence', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    await h.participation.cancel(
      'session',
      'player',
      'master',
      ' Private cancellation ',
    );
    const original = structuredClone(h.state().participants[0]);
    await h.participation.cancel('session', 'player', 'master', 'Other reason');
    expect(h.state().participants[0]).toEqual(original);
    expect(JSON.stringify(h.state().audits)).not.toContain(
      'Private cancellation',
    );
    await expect(
      h.participation.recordAttendance('session', 'player', 'master', absent),
    ).rejects.toMatchObject({ response: { code: 'PARTICIPATION_CANCELLED' } });
  });

  it('cannot cancel an already classified player or register attendance in a cancelled session', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    await h.participation.recordAttendance(
      'session',
      'player',
      'master',
      attended,
    );
    await expect(
      h.participation.cancel('session', 'player', 'master', 'Reason'),
    ).rejects.toMatchObject({
      response: { code: 'PARTICIPATION_ALREADY_REVIEWED' },
    });
    h.state().session.status = SessionStatus.CANCELLED;
    await expect(
      h.participation.recordAttendance('session', 'player', 'master', absent),
    ).rejects.toMatchObject({ response: { code: 'SESSION_CLOSED' } });
  });

  it('requires ADMIN and a reason for completed-session corrections, retaining reason privately', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    await h.participation.recordAttendance(
      'session',
      'player',
      'master',
      absent,
    );
    await h.sessions.changeStatus('session', 'master', {
      status: SessionStatus.COMPLETED,
    });
    await expect(
      h.participation.recordAttendance('session', 'player', 'master', {
        ...attended,
        reason: 'Correction',
      }),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_ROLE_REQUIRED' } });
    await expect(
      h.participation.recordAttendance('session', 'player', 'admin', attended),
    ).rejects.toMatchObject({
      response: { code: 'PARTICIPATION_REASON_REQUIRED' },
    });
    const result = await h.participation.recordAttendance(
      'session',
      'player',
      'admin',
      { ...attended, reason: 'Private correction' },
    );
    expect(h.state().participants[0].attendanceCorrectionReason).toBe(
      'Private correction',
    );
    expect(result).not.toHaveProperty('attendanceCorrectionReason');
    expect(h.state().audits.at(-1)?.metadata).toMatchObject({
      changed: true,
      correction: true,
      fromStatus: 'NO_SHOW',
      toStatus: 'ATTENDED',
    });
    expect(JSON.stringify(h.state().audits)).not.toContain(
      'Private correction',
    );
  });

  it('blocks correction after any feedback, but preserves a reasoned no-op without rewriting timestamps', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    await h.participation.recordAttendance(
      'session',
      'player',
      'master',
      attended,
    );
    await h.sessions.changeStatus('session', 'master', {
      status: SessionStatus.COMPLETED,
    });
    h.state().feedbackCount = 1;
    await expect(
      h.participation.recordAttendance('session', 'player', 'admin', {
        ...absent,
        reason: 'Correction',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PARTICIPATION_HAS_FEEDBACK' },
    });
    const before = structuredClone(h.state().participants);
    await h.participation.recordAttendance('session', 'player', 'admin', {
      ...attended,
      reason: 'Repeated decision',
    });
    expect(h.state().participants).toEqual(before);
  });

  it('rolls back participation when audit fails and rechecks authority after a serialization retry', async () => {
    const failed = participationHarness();
    failed.failAudit();
    await expect(
      failed.participation.add('session', 'master', 'player'),
    ).rejects.toThrow('Synthetic audit failure');
    expect(failed.state().participants).toEqual([]);
    expect(failed.state().audits).toEqual([]);
    const retried = participationHarness();
    retried.retryOnce(() => {
      retried.state().users.master.clubRoles = [];
    });
    await expect(
      retried.participation.add('session', 'master', 'player'),
    ).rejects.toMatchObject({ response: { code: 'MASTER_ROLE_REQUIRED' } });
    expect(retried.state().participants).toEqual([]);
    expect(retried.state().audits).toEqual([]);
  });

  it('does not allow missing or MASTER participation to be manually classified', async () => {
    const h = participationHarness();
    await expect(
      h.participation.recordAttendance(
        'session',
        'missing',
        'master',
        attended,
      ),
    ).rejects.toMatchObject({ response: { code: 'PARTICIPANT_NOT_FOUND' } });
    await h.sessions.changeStatus('session', 'master', {
      status: SessionStatus.COMPLETED,
    });
    await expect(
      h.participation.recordAttendance('session', 'master', 'admin', {
        ...absent,
        reason: 'Correction',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SESSION_MASTER_PARTICIPATION' },
    });
  });

  it.each(['campaign', 'oneShot'] as const)(
    'completes %s only after attendance and creates master presence once, atomically',
    async (kind) => {
      const h = participationHarness(kind);
      const complete = () =>
        kind === 'campaign'
          ? h.sessions.changeStatus(
              'session',
              'master',
              { status: SessionStatus.COMPLETED },
              'completion-request',
            )
          : h.oneShots.changeStatus(
              'one-shot',
              'master',
              { status: OneShotStatus.COMPLETED },
              'completion-request',
            );
      await h.participation.add('session', 'master', 'player');
      await expect(complete()).rejects.toMatchObject({
        response: { code: 'SESSION_ATTENDANCE_PENDING' },
      });
      expect(h.state().session.status).toBe('SCHEDULED');
      await h.participation.recordAttendance(
        'session',
        'player',
        'master',
        attended,
      );
      h.retryOnce();
      await complete();
      expect(h.state().session.status).toBe('COMPLETED');
      if (kind === 'oneShot') expect(h.state().oneShotStatus).toBe('COMPLETED');
      expect(
        h
          .state()
          .participants.filter((p) => p.role === SessionParticipantRole.MASTER),
      ).toMatchObject([{ userId: 'master', status: 'ATTENDED' }]);
      expect(
        h
          .state()
          .audits.filter((a) => a.action === AUDIT_ACTION.SESSION_COMPLETED),
      ).toMatchObject([
        {
          actorId: 'master',
          requestId: 'completion-request',
          metadata: { attendedPlayers: 1, absentPlayers: 0 },
        },
      ]);
      await expect(complete()).rejects.toBeDefined();
      expect(h.state().participants).toHaveLength(2);
      expect(h.outside).not.toHaveBeenCalled();
    },
  );

  it.each(['campaign', 'oneShot'] as const)(
    'rolls back %s status, master presence and audit when status update fails',
    async (kind) => {
      const h = participationHarness(kind);
      h.failStatusWrite();
      await expect(
        kind === 'campaign'
          ? h.sessions.changeStatus('session', 'master', {
              status: SessionStatus.COMPLETED,
            })
          : h.oneShots.changeStatus('one-shot', 'master', {
              status: OneShotStatus.COMPLETED,
            }),
      ).rejects.toThrow('Synthetic status failure');
      expect(h.state().session.status).toBe('SCHEDULED');
      expect(h.state().oneShotStatus).toBe('SCHEDULED');
      expect(h.state().participants).toEqual([]);
      expect(h.state().audits).toEqual([]);
    },
  );

  it('ignores cancelled players for completion and never promotes them to absent', async () => {
    const h = participationHarness();
    await h.participation.add('session', 'master', 'player');
    await h.participation.cancel('session', 'player', 'master', 'Reason');
    await h.sessions.changeStatus('session', 'master', {
      status: SessionStatus.COMPLETED,
    });
    expect(h.state().participants[0].status).toBe('CANCELLED');
    expect(h.state().audits.at(-1)?.metadata).toEqual({
      attendedPlayers: 0,
      absentPlayers: 0,
    });
  });
});
