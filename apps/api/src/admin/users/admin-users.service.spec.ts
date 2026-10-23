import { AuditService } from '../../audit/audit.service';
import { AuthorizationService } from '../../authorization/authorization.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from '../../generated/prisma/client';
import {
  AccountStatus,
  ClubRole,
  SystemRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminUsersService } from './admin-users.service';
import {
  ChangeSystemRoleDto,
  GrantClubRoleDto,
  ListAdminUsersDto,
} from './admin-users.dto';
import {
  adminUserDetailSelect,
  adminUserListSelect,
} from './admin-users.select';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('private SQL/constraint detail', {
    code,
    clientVersion: '7',
  });
const approved = (id: string, systemRole: SystemRole = SystemRole.USER) => ({
  id,
  status: AccountStatus.APPROVED,
  systemRole,
  clubRoles: [],
});

describe('Administrative role DTO boundaries', () => {
  it('accepts only SystemRole enum values and rejects privileged extras', () => {
    for (const role of Object.values(SystemRole))
      expect(
        validateSync(
          plainToInstance(ChangeSystemRoleDto, { systemRole: role }),
        ),
      ).toHaveLength(0);
    for (const role of ['OWNER', null, undefined])
      expect(
        validateSync(plainToInstance(ChangeSystemRoleDto, { systemRole: role }))
          .length,
      ).toBeGreaterThan(0);
    expect(
      validateSync(
        plainToInstance(ChangeSystemRoleDto, {
          systemRole: 'ADMIN',
          status: 'APPROVED',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ).length,
    ).toBeGreaterThan(0);
  });
  it('accepts only ClubRole enum values without trusting supplied grant metadata', () => {
    for (const role of Object.values(ClubRole))
      expect(
        validateSync(plainToInstance(GrantClubRoleDto, { role })),
      ).toHaveLength(0);
    for (const role of ['OWNER', null, undefined])
      expect(
        validateSync(plainToInstance(GrantClubRoleDto, { role })).length,
      ).toBeGreaterThan(0);
    expect(
      validateSync(
        plainToInstance(GrantClubRoleDto, {
          role: 'MASTER',
          grantedById: 'client',
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('AdminUsersService', () => {
  let actor: any,
    target: any,
    transaction: any,
    root: any,
    service: AdminUsersService;
  const query = () => new ListAdminUsersDto();
  beforeEach(() => {
    actor = approved('operator', SystemRole.ADMIN);
    target = approved('target');
    transaction = {
      user: {
        findUnique: jest.fn(async ({ where }) =>
          where.id === actor.id
            ? actor
            : where.id === 'missing'
              ? null
              : target,
        ),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      userClubRole: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({
            role: 'MASTER',
            grantedAt: new Date('2026-01-01Z'),
          }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const fail = () => {
      throw new Error('Operation escaped transaction');
    };
    root = {
      user: {
        findUnique: jest.fn(fail),
        findMany: jest.fn(fail),
        count: jest.fn(fail),
        updateMany: jest.fn(fail),
      },
      userClubRole: {
        createMany: jest.fn(fail),
        findUnique: jest.fn(fail),
        deleteMany: jest.fn(fail),
      },
      $transaction: jest.fn((callback) => callback(transaction)),
    };
    const prisma = root as PrismaService;
    service = new AdminUsersService(prisma, new AuthorizationService(prisma), {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService);
  });

  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'allows approved %s through the central policy on list/detail',
    async (role) => {
      actor.systemRole = role;
      await service.list(actor.id, query());
      await service.findOne('target', actor.id);
      expect(root.user.findUnique).not.toHaveBeenCalled();
      expect(transaction.user.findUnique).toHaveBeenCalledWith({
        where: { id: actor.id },
        select: { status: true, systemRole: true },
      });
    },
  );
  it.each([{ clubRoles: [] }, { clubRoles: [{ role: ClubRole.ADMIN }] }])(
    'denies USER regardless of club admin %j',
    async ({ clubRoles }) => {
      actor.systemRole = SystemRole.USER;
      actor.clubRoles = clubRoles;
      for (const operation of [
        () => service.list(actor.id, query()),
        () => service.findOne('target', actor.id),
        () => service.changeSystemRole('target', actor.id, SystemRole.DEV),
        () => service.grantClubRole('target', actor.id, ClubRole.MASTER),
        () => service.removeClubRole('target', actor.id, ClubRole.MASTER),
      ]) {
        await expect(operation()).rejects.toMatchObject({
          status: 403,
          response: { code: 'ADMIN_ROLE_REQUIRED' },
        });
      }
      expect(transaction.user.findMany).not.toHaveBeenCalled();
      expect(transaction.user.updateMany).not.toHaveBeenCalled();
      expect(transaction.userClubRole.createMany).not.toHaveBeenCalled();
    },
  );
  it.each(
    [
      AccountStatus.PENDING,
      AccountStatus.REJECTED,
      AccountStatus.SUSPENDED,
      AccountStatus.DELETION_PENDING,
      AccountStatus.ANONYMIZED,
    ].flatMap((status) =>
      [SystemRole.ADMIN, SystemRole.DEV].map((role) => [status, role]),
    ),
  )('denies direct service privileges for %s + %s', async (status, role) => {
    actor.status = status;
    actor.systemRole = role;
    await expect(service.list(actor.id, query())).rejects.toMatchObject({
      status: 403,
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
    await expect(
      service.changeSystemRole('target', actor.id, SystemRole.ADMIN),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.grantClubRole('target', actor.id, ClubRole.MASTER),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.removeClubRole('target', actor.id, ClubRole.MASTER),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('queries bounded deterministic pagination and count with the same filter and snapshot', async () => {
    const filter = {
      ...query(),
      page: 2,
      limit: 10,
      status: AccountStatus.PENDING,
      systemRole: SystemRole.USER,
    };
    transaction.user.findMany.mockResolvedValue([{ id: 'page-2' }]);
    transaction.user.count.mockResolvedValue(21);
    expect(await service.list(actor.id, filter)).toEqual({
      items: [{ id: 'page-2' }],
      meta: { page: 2, limit: 10, total: 21, pages: 3 },
    });
    expect(root.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(transaction.user.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING', systemRole: 'USER' },
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: adminUserListSelect,
    });
    expect(transaction.user.count).toHaveBeenCalledWith({
      where: { status: 'PENDING', systemRole: 'USER' },
    });
    expect(root.user.findMany).not.toHaveBeenCalled();
  });
  it('supports no filters and empty pages', async () => {
    expect(await service.list(actor.id, query())).toMatchObject({
      items: [],
      meta: { total: 0, pages: 0 },
    });
    expect(transaction.user.count).toHaveBeenCalledWith({ where: {} });
  });
  it('rejects an unrepresentable offset before submitting a Prisma query', async () => {
    await expect(
      service.list(actor.id, { ...query(), page: 1e100 }),
    ).rejects.toMatchObject({ status: 400, response: { code: 'BAD_REQUEST' } });
    expect(transaction.user.findMany).not.toHaveBeenCalled();
  });
  it('uses a minimal general list and operational detail query rather than stripping private fields later', async () => {
    await service.findOne('target', actor.id);
    expect(transaction.user.findUnique).toHaveBeenLastCalledWith({
      where: { id: 'target' },
      select: adminUserDetailSelect,
    });
    for (const select of [adminUserListSelect, adminUserDetailSelect])
      for (const forbidden of [
        'whatsappNumber',
        'birthDate',
        'passwordHash',
        'authVersion',
        'reviewNote',
        'suspensionReason',
        'reviewedById',
        'reports',
        'auditLogs',
      ])
        expect(JSON.stringify(select)).not.toContain(forbidden);
    expect(adminUserListSelect).not.toHaveProperty('email');
    expect(adminUserListSelect).not.toHaveProperty('deletionExpiresAt');
    expect(adminUserDetailSelect.email).toBe(true);
    expect(adminUserDetailSelect.profile.select).toEqual({ displayName: true });
  });
  it('returns USER_NOT_FOUND for missing details or mutation targets', async () => {
    await expect(service.findOne('missing', actor.id)).rejects.toMatchObject({
      status: 404,
      response: { code: 'USER_NOT_FOUND' },
    });
    await expect(
      service.changeSystemRole('missing', actor.id, SystemRole.ADMIN),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.grantClubRole('missing', actor.id, ClubRole.PLAYER),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.removeClubRole('missing', actor.id, ClubRole.PLAYER),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each([SystemRole.USER, SystemRole.ADMIN, SystemRole.DEV])(
    'changes another approved account to %s without implicit status or club-role changes',
    async (role) => {
      target.systemRole =
        role === SystemRole.USER ? SystemRole.ADMIN : SystemRole.USER;
      const old = target.systemRole;
      expect(await service.changeSystemRole(target.id, actor.id, role)).toEqual(
        { id: 'target', systemRole: role },
      );
      expect(transaction.user.updateMany).toHaveBeenCalledWith({
        where: { id: target.id, status: 'APPROVED', systemRole: old },
        data: { systemRole: role },
      });
      expect(transaction.userClubRole.createMany).not.toHaveBeenCalled();
      expect(root.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
    },
  );
  it('same system-role decision is a no-op without renewing updatedAt', async () => {
    expect(
      await service.changeSystemRole(target.id, actor.id, SystemRole.USER),
    ).toEqual({ id: target.id, systemRole: 'USER' });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it('does not overwrite a failed compare-and-set', async () => {
    transaction.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.changeSystemRole(target.id, actor.id, SystemRole.DEV),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'USER_ROLE_CONFLICT' },
    });
  });
  it('denies every self-role mutation without inventing a last-admin count', async () => {
    for (const operation of [
      () => service.changeSystemRole(actor.id, actor.id, SystemRole.USER),
      () => service.grantClubRole(actor.id, actor.id, ClubRole.MASTER),
      () => service.removeClubRole(actor.id, actor.id, ClubRole.MASTER),
    ])
      await expect(operation()).rejects.toMatchObject({
        status: 409,
        response: { code: 'USER_ADMIN_OPERATION_NOT_ALLOWED' },
      });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
    expect(transaction.user.count).not.toHaveBeenCalled();
    expect(transaction.userClubRole.createMany).not.toHaveBeenCalled();
  });
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])('never changes roles or restores a %s target', async (status) => {
    target.status = status;
    for (const operation of [
      () => service.changeSystemRole(target.id, actor.id, SystemRole.DEV),
      () => service.grantClubRole(target.id, actor.id, ClubRole.MASTER),
      () => service.removeClubRole(target.id, actor.id, ClubRole.MASTER),
    ])
      await expect(operation()).rejects.toMatchObject({
        status: 409,
        response: { code: 'USER_ADMIN_OPERATION_NOT_ALLOWED' },
      });
    expect(target.status).toBe(status);
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
    expect(transaction.userClubRole.createMany).not.toHaveBeenCalled();
    expect(transaction.userClubRole.deleteMany).not.toHaveBeenCalled();
  });
  it.each([ClubRole.PLAYER, ClubRole.MASTER, ClubRole.ADMIN])(
    'grants %s with server-owned grant metadata and no SystemRole update',
    async (role) => {
      await service.grantClubRole(target.id, actor.id, role);
      expect(transaction.userClubRole.createMany).toHaveBeenCalledWith({
        data: {
          userId: target.id,
          role,
          grantedById: actor.id,
          grantedAt: expect.any(Date),
        },
        skipDuplicates: true,
      });
      expect(transaction.userClubRole.findUnique).toHaveBeenCalledWith({
        where: { userId_role: { userId: target.id, role } },
        select: { role: true, grantedAt: true },
      });
      expect(transaction.user.updateMany).not.toHaveBeenCalled();
      expect(root.userClubRole.createMany).not.toHaveBeenCalled();
    },
  );
  it('duplicate grant is a no-op preserving original grantor and timestamp', async () => {
    let stored: any;
    transaction.userClubRole.createMany.mockImplementation(async ({ data }) => {
      if (stored) return { count: 0 };
      stored = { id: 'cuid-original', ...data };
      return { count: 1 };
    });
    transaction.userClubRole.findUnique.mockImplementation(async () => stored);
    const first = await service.grantClubRole(
      target.id,
      actor.id,
      ClubRole.MASTER,
    );
    actor = approved('other-operator', SystemRole.DEV);
    const second = await service.grantClubRole(
      target.id,
      actor.id,
      ClubRole.MASTER,
    );
    expect(second).toEqual(first);
    expect(stored.grantedById).toBe('operator');
  });
  it.each([0, 1])(
    'removal with %i existing links is idempotent and exactly scoped',
    async (count) => {
      transaction.userClubRole.deleteMany.mockResolvedValue({ count });
      await expect(
        service.removeClubRole(target.id, actor.id, ClubRole.MASTER),
      ).resolves.toBeUndefined();
      expect(transaction.userClubRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: target.id, role: 'MASTER' },
      });
      expect(transaction.user.updateMany).not.toHaveBeenCalled();
    },
  );
  it('sanitizes a raced uniqueness error but never swallows unrelated Prisma failures', async () => {
    transaction.userClubRole.createMany.mockRejectedValueOnce(
      prismaError('P2002'),
    );
    await expect(
      service.grantClubRole(target.id, actor.id, ClubRole.MASTER),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'USER_ROLE_CONFLICT' },
    });
    const unexpected = prismaError('P2028');
    transaction.userClubRole.createMany.mockRejectedValueOnce(unexpected);
    await expect(
      service.grantClubRole(target.id, actor.id, ClubRole.MASTER),
    ).rejects.toBe(unexpected);
  });
  it('stops after three serialization conflicts with a safe domain error', async () => {
    root.$transaction.mockRejectedValue(prismaError('P2034'));
    await expect(
      service.changeSystemRole(target.id, actor.id, SystemRole.ADMIN),
    ).rejects.toMatchObject({ response: { code: 'USER_ROLE_CONFLICT' } });
    expect(root.$transaction).toHaveBeenCalledTimes(3);
  });
});

describe('Admin user transaction retries', () => {
  it.each(['grant', 'remove'])(
    'reports a club %s conflict without an unnecessary automatic retry',
    async (mode) => {
      const clients: any[] = [];
      const root = {
        $transaction: async (callback, options) => {
          expect(options.isolationLevel).toBe('ReadCommitted');
          const conflict = jest.fn(async () => {
            throw prismaError('P2034');
          });
          const tx = {
            user: {
              findUnique: jest.fn(async ({ where }) =>
                where.id === 'operator'
                  ? approved('operator', SystemRole.ADMIN)
                  : approved('target'),
              ),
            },
            userClubRole: { createMany: conflict, deleteMany: conflict },
          };
          clients.push(tx);
          return callback(tx);
        },
      };
      const prisma = root as unknown as PrismaService;
      const service = new AdminUsersService(
        prisma,
        new AuthorizationService(prisma),
        {
          record: jest.fn().mockResolvedValue(undefined),
        } as unknown as AuditService,
      );
      await expect(
        mode === 'grant'
          ? service.grantClubRole('target', 'operator', ClubRole.MASTER)
          : service.removeClubRole('target', 'operator', ClubRole.MASTER),
      ).rejects.toMatchObject({
        response: { code: 'USER_ROLE_CONFLICT' },
      });
      expect(clients).toHaveLength(1);
      expect(clients[0].user.findUnique).toHaveBeenCalledTimes(2);
    },
  );
  it.each([
    'operator demoted',
    'operator unavailable',
    'target deletion',
    'system-role changed',
  ])(
    'rereads all decisions on a new TransactionClient after P2034: %s',
    async (scenario) => {
      const clients: any[] = [];
      const root = {
        $transaction: jest.fn(async (callback, options) => {
          expect(options.isolationLevel).toBe('Serializable');
          const attempt = clients.length;
          const tx = {
            user: {
              findUnique: jest.fn(async ({ where }) =>
                where.id === 'operator'
                  ? {
                      ...approved(
                        'operator',
                        scenario === 'operator demoted' && attempt > 0
                          ? SystemRole.USER
                          : SystemRole.DEV,
                      ),
                      status:
                        scenario === 'operator unavailable' && attempt > 0
                          ? AccountStatus.SUSPENDED
                          : AccountStatus.APPROVED,
                    }
                  : {
                      ...approved(
                        'target',
                        attempt > 0 ? SystemRole.DEV : SystemRole.USER,
                      ),
                      status:
                        scenario === 'target deletion' && attempt > 0
                          ? AccountStatus.DELETION_PENDING
                          : AccountStatus.APPROVED,
                    },
              ),
              updateMany: jest.fn(async () => {
                if (!attempt) throw prismaError('P2034');
                return { count: 1 };
              }),
            },
          };
          clients.push(tx);
          return callback(tx);
        }),
      };
      const prisma = root as unknown as PrismaService;
      const service = new AdminUsersService(
        prisma,
        new AuthorizationService(prisma),
        {
          record: jest.fn().mockResolvedValue(undefined),
        } as unknown as AuditService,
      );
      const operation = service.changeSystemRole(
        'target',
        'operator',
        SystemRole.ADMIN,
      );
      if (
        scenario === 'operator demoted' ||
        scenario === 'operator unavailable'
      )
        await expect(operation).rejects.toMatchObject({
          response: { code: 'ADMIN_ROLE_REQUIRED' },
        });
      else if (scenario === 'target deletion')
        await expect(operation).rejects.toMatchObject({
          response: { code: 'USER_ADMIN_OPERATION_NOT_ALLOWED' },
        });
      else {
        await expect(operation).resolves.toEqual({
          id: 'target',
          systemRole: 'ADMIN',
        });
        expect(clients[1].user.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'target', status: 'APPROVED', systemRole: 'DEV' },
          }),
        );
      }
      expect(clients).toHaveLength(2);
      expect(clients[0]).not.toBe(clients[1]);
      expect(clients[1].user.findUnique).toHaveBeenCalledWith({
        where: { id: 'operator' },
        select: { status: true, systemRole: true },
      });
      if (
        scenario !== 'operator demoted' &&
        scenario !== 'operator unavailable'
      )
        expect(clients[1].user.findUnique).toHaveBeenCalledWith({
          where: { id: 'target' },
          select: { id: true, status: true, systemRole: true },
        });
      else expect(clients[1].user.updateMany).not.toHaveBeenCalled();
    },
  );
  it('serializes mutually demoting operators: losing attempt retries and loses authorization', async () => {
    let state: Record<string, any> = {
      a: approved('a', SystemRole.ADMIN),
      b: approved('b', SystemRole.DEV),
    };
    let version = 0,
      arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const clients: any[] = [];
    const root = {
      $transaction: async (callback, options) => {
        expect(options.isolationLevel).toBe('Serializable');
        const initialVersion = version,
          snapshot = structuredClone(state);
        const writes: any[] = [];
        const tx = {
          user: {
            findUnique: jest.fn(async ({ where }) => snapshot[where.id]),
            updateMany: jest.fn(async ({ where, data }) => {
              writes.push({ where, data });
              if (initialVersion === 0) {
                if (++arrivals === 2) release();
                await gate;
              }
              return { count: 1 };
            }),
          },
        };
        clients.push(tx);
        const result = await callback(tx);
        if (writes.length && version !== initialVersion)
          throw prismaError('P2034');
        if (writes.length) {
          for (const { where, data } of writes)
            state[where.id] = { ...state[where.id], ...data };
          version++;
        }
        return result;
      },
    };
    const prisma = root as unknown as PrismaService;
    const service = new AdminUsersService(
      prisma,
      new AuthorizationService(prisma),
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService,
    );
    const results = await Promise.allSettled([
      service.changeSystemRole('b', 'a', SystemRole.USER),
      service.changeSystemRole('a', 'b', SystemRole.USER),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { response: { code: 'ADMIN_ROLE_REQUIRED' } } });
    expect(
      Object.values(state).filter((user) => user.systemRole !== 'USER'),
    ).toHaveLength(1);
    expect(clients).toHaveLength(3);
  });
});

describe('Concurrent club-role decisions', () => {
  const repository = () => {
    let stored: any = null;
    let tail = Promise.resolve();
    const clients: any[] = [];
    const root = {
      $transaction: async (callback, options) => {
        expect(options.isolationLevel).toBe('ReadCommitted');
        let local: any, release: (() => void) | undefined;
        // Models the unique-key/row write coordination of insert/delete, not
        // snapshot-wide serialization or a production application mutex.
        const acquire = async () => {
          const previous = tail;
          tail = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previous;
          local = structuredClone(stored);
        };
        const tx = {
          user: {
            findUnique: jest.fn(async ({ where }) =>
              approved(
                where.id,
                where.id === 'target' ? SystemRole.USER : SystemRole.ADMIN,
              ),
            ),
          },
          userClubRole: {
            createMany: jest.fn(async ({ data }) => {
              await acquire();
              if (local) return { count: 0 };
              local = { id: 'cuid-original', ...data };
              return { count: 1 };
            }),
            findUnique: jest.fn(async () => local),
            deleteMany: jest.fn(async () => {
              await acquire();
              const count = local ? 1 : 0;
              local = null;
              return { count };
            }),
          },
        };
        clients.push(tx);
        try {
          const result = await callback(tx);
          if (release) stored = local;
          return result;
        } finally {
          release?.();
        }
      },
    };
    const prisma = root as unknown as PrismaService;
    return {
      service: new AdminUsersService(prisma, new AuthorizationService(prisma), {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditService),
      clients,
      stored: () => stored,
    };
  };
  it('concurrent duplicate grants retain one unique link and original metadata without Serializable', async () => {
    const repo = repository();
    const results = await Promise.all([
      repo.service.grantClubRole('target', 'operator-a', ClubRole.MASTER),
      repo.service.grantClubRole('target', 'operator-b', ClubRole.MASTER),
    ]);
    expect(results[1]).toEqual(results[0]);
    expect(repo.stored()).toMatchObject({ userId: 'target', role: 'MASTER' });
    expect(repo.stored().grantedById).toBe('operator-a');
    expect(repo.clients).toHaveLength(2);
    expect(repo.clients[1].user.findUnique).toHaveBeenCalledTimes(2);
    expect(repo.clients[1].userClubRole.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
  it('concurrent grant/remove coordinates only the affected unique link without retrying the transaction', async () => {
    const repo = repository();
    await Promise.all([
      repo.service.grantClubRole('target', 'operator-a', ClubRole.MASTER),
      repo.service.removeClubRole('target', 'operator-b', ClubRole.MASTER),
    ]);
    expect(repo.clients).toHaveLength(2);
    expect(repo.clients[1].user.findUnique).toHaveBeenCalledTimes(2);
    expect(repo.stored()).toBeNull();
  });
});
