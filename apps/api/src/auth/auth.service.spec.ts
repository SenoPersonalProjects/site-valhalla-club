import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AccountStatus, SystemRole } from '../generated/prisma/enums';
import { TableActorsService } from '../tables/table-actors.service';
import { AuthService, sessionUserSelect } from './auth.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  const user = {
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const transaction = {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
  };
  const prisma = {
    user,
    $transaction: jest.fn((callback) => callback(transaction)),
  };
  const passwords = { hash: jest.fn(), verify: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  const actors = { assertAdministrator: jest.fn() };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
    actors as unknown as TableActorsService,
  );
  const registration = {
    email: ' TEST@EXAMPLE.COM ',
    password: 'long-test-password',
    displayName: ' Player ',
    whatsappNumber: '+55 (82) 99999-1234',
    birthDate: '1990-01-01',
  };
  beforeEach(() => {
    jest.clearAllMocks();
    passwords.hash.mockResolvedValue('hashed-value');
    passwords.verify.mockResolvedValue(true);
    user.create.mockResolvedValue({
      id: 'new-user',
      status: AccountStatus.PENDING,
    });
    user.findUnique.mockResolvedValue({
      id: 'user',
      status: AccountStatus.APPROVED,
      passwordHash: 'hashed-value',
      authVersion: 2,
    });
    jwt.signAsync.mockResolvedValue('signed-token');
    actors.assertAdministrator.mockResolvedValue(undefined);
    transaction.user.findUnique.mockResolvedValue({
      id: 'target',
      status: AccountStatus.PENDING,
    });
    transaction.user.updateMany.mockResolvedValue({ count: 1 });
    user.updateMany.mockResolvedValue({ count: 1 });
  });
  it('creates pending user and normalized profile in one nested atomic write without automatic roles', async () => {
    const result = await service.register(registration);
    expect(user.create).toHaveBeenCalledWith({
      data: {
        email: 'test@example.com',
        passwordHash: 'hashed-value',
        status: AccountStatus.PENDING,
        systemRole: SystemRole.USER,
        profile: {
          create: {
            displayName: 'Player',
            whatsappNumber: '+5582999991234',
            birthDate: new Date('1990-01-01T00:00:00Z'),
          },
        },
      },
      select: { id: true, status: true },
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(user.create.mock.calls)).not.toContain(
      registration.password,
    );
  });
  it.each(['email', 'whatsappNumber'])(
    'translates raced %s uniqueness into a deterministic domain conflict',
    async (field) => {
      user.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('private database error', {
          code: 'P2002',
          clientVersion: '7',
          meta: { target: [field] },
        }),
      );
      await expect(service.register(registration)).rejects.toMatchObject({
        response: { code: 'REGISTRATION_CONFLICT' },
        status: 409,
      });
    },
  );
  it('does not swallow other Prisma errors', async () => {
    const error = new Error('internal');
    user.create.mockRejectedValueOnce(error);
    await expect(service.register(registration)).rejects.toBe(error);
  });
  it('issues only essential access claims after correct credentials', async () => {
    expect(
      await service.login({
        email: ' TEST@EXAMPLE.COM ',
        password: 'password',
      }),
    ).toEqual({ accessToken: 'signed-token', tokenType: 'Bearer' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user',
      ver: 2,
      type: 'access',
    });
    expect(user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'test@example.com' } }),
    );
  });
  it.each(['absent', 'wrong-password'])(
    'does not enumerate credentials: %s',
    async (scenario) => {
      if (scenario === 'absent') user.findUnique.mockResolvedValueOnce(null);
      else passwords.verify.mockResolvedValueOnce(false);
      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toMatchObject({
        status: 401,
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(passwords.verify).toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])('blocks correct credentials for %s', async (status) => {
    user.findUnique.mockResolvedValueOnce({ status, passwordHash: 'hash' });
    await expect(
      service.login({ email: 'test@example.com', password: 'correct' }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: `ACCOUNT_${status}` },
    });
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it('me queries only safe session fields', async () => {
    await service.me('user');
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user' },
      select: sessionUserSelect,
    });
    const query = JSON.stringify(sessionUserSelect);
    for (const forbidden of [
      'passwordHash',
      'authVersion',
      'reviewedById',
      'suspensionReason',
      'reports',
    ])
      expect(query).not.toContain(forbidden);
  });
  it('logout uses one atomic conditional increment', async () => {
    await service.logout('user');
    expect(user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user', status: AccountStatus.APPROVED },
      data: { authVersion: { increment: 1 } },
    });
  });
  it('denies logout if the account became unavailable before the increment', async () => {
    user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.logout('user')).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_ACCOUNT_UNAVAILABLE' },
    });
  });
  it.each(['APPROVED', 'REJECTED'] as const)(
    'reviews %s transactionally with reviewer metadata and a pending-state compare-and-set',
    async (decision) => {
      expect(
        await service.review('target', 'admin', {
          decision,
          note: ' justified ',
        }),
      ).toEqual({ id: 'target', status: decision });
      expect(actors.assertAdministrator).toHaveBeenCalledWith(
        'admin',
        transaction,
      );
      expect(transaction.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'target' },
        select: { id: true, status: true },
      });
      expect(transaction.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'target', status: 'PENDING' },
        data: {
          status: decision,
          reviewedById: 'admin',
          reviewedAt: expect.any(Date),
          reviewNote: 'justified',
        },
      });
      expect(user.updateMany).not.toHaveBeenCalled();
    },
  );
  it('requires a rejection note before writing', async () => {
    await expect(
      service.review('target', 'admin', { decision: 'REJECTED', note: ' ' }),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_REJECTION_NOTE_REQUIRED' },
    });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it('does not overwrite a concurrent registration review', async () => {
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.review('target', 'admin', { decision: 'APPROVED' }),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_REVIEW_CONFLICT' },
    });
  });
  it('does not implement suspension/reactivation or rejection reversal', async () => {
    transaction.user.findUnique.mockResolvedValueOnce({
      id: 'target',
      status: 'SUSPENDED',
    });
    await expect(
      service.review('target', 'admin', { decision: 'APPROVED' }),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_REVIEW_NOT_PENDING' },
    });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it('repeated decision is a no-op preserving review metadata', async () => {
    transaction.user.findUnique.mockResolvedValueOnce({
      id: 'target',
      status: 'APPROVED',
    });
    await service.review('target', 'admin', { decision: 'APPROVED' });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
  it('requires a note even for a repeated REJECTED decision and never rewrites metadata', async () => {
    transaction.user.findUnique.mockResolvedValue({
      id: 'target',
      status: 'REJECTED',
    });
    await expect(
      service.review('target', 'admin', { decision: 'REJECTED' }),
    ).rejects.toMatchObject({
      response: { code: 'REGISTRATION_REJECTION_NOTE_REQUIRED' },
    });
    await expect(
      service.review('target', 'admin', {
        decision: 'REJECTED',
        note: 'New note must not replace old note',
      }),
    ).resolves.toEqual({ id: 'target', status: 'REJECTED' });
    expect(transaction.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('Authentication concurrency', () => {
  it('allows only one decision when two reviewers both read PENDING', async () => {
    let state: Record<string, unknown> = {
      id: 'target',
      status: AccountStatus.PENDING,
    };
    let readers = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const updates: unknown[] = [];
    const clients: unknown[] = [];
    const root = {
      user: {
        findUnique: jest.fn(() => {
          throw new Error('State read outside transaction');
        }),
        updateMany: jest.fn(() => {
          throw new Error('Write outside transaction');
        }),
      },
      $transaction: async (
        callback: (transaction: unknown) => Promise<unknown>,
      ) => {
        const transaction = {
          user: {
            findUnique: async ({ where }: { where: { id: string } }) => {
              if (where.id !== 'target')
                return {
                  status: AccountStatus.APPROVED,
                  systemRole: SystemRole.ADMIN,
                };
              const snapshot = { id: state.id, status: state.status };
              if (++readers === 2) release();
              await gate;
              return snapshot;
            },
            updateMany: async ({
              where,
              data,
            }: {
              where: { status: string };
              data: Record<string, unknown>;
            }) => {
              updates.push({ where, data });
              if (state.status !== where.status) return { count: 0 };
              state = { ...state, ...data };
              return { count: 1 };
            },
          },
        };
        clients.push(transaction);
        return callback(transaction);
      },
    };
    const prisma = root as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      {} as PasswordService,
      {} as JwtService,
      new TableActorsService(prisma),
    );
    const results = await Promise.allSettled([
      service.review('target', 'reviewer-a', {
        decision: 'APPROVED',
        note: 'A',
      }),
      service.review('target', 'reviewer-b', {
        decision: 'REJECTED',
        note: 'B',
      }),
    ]);
    expect(readers).toBe(2);
    expect(clients[0]).not.toBe(clients[1]);
    expect(updates).toHaveLength(2);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: { response: { code: 'REGISTRATION_REVIEW_CONFLICT' } },
    });
    const winner = results.findIndex((result) => result.status === 'fulfilled');
    expect(state).toMatchObject({
      status: winner === 0 ? 'APPROVED' : 'REJECTED',
      reviewedById: winner === 0 ? 'reviewer-a' : 'reviewer-b',
      reviewNote: winner === 0 ? 'A' : 'B',
      reviewedAt: expect.any(Date),
    });
    expect(root.user.findUnique).not.toHaveBeenCalled();
    expect(root.user.updateMany).not.toHaveBeenCalled();
  });

  it('increments rather than restoring a stale authVersion on concurrent logouts', async () => {
    let authVersion = 7;
    const updateMany = jest.fn(async ({ data }) => {
      authVersion += data.authVersion.increment;
      return { count: 1 };
    });
    const service = new AuthService(
      { user: { updateMany } } as unknown as PrismaService,
      {} as PasswordService,
      {} as JwtService,
      {} as TableActorsService,
    );
    await Promise.all([service.logout('user'), service.logout('user')]);
    expect(authVersion).toBe(9);
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
