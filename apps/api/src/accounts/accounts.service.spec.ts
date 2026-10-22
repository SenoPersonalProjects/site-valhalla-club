import {
  AccountsService,
  ACCOUNT_DELETION_WINDOW_MS,
  accountDeletionSelect,
  ownProfileSelect,
} from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AccountStatus } from '../generated/prisma/enums';

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('private database detail', {
    code,
    clientVersion: '7',
  });

describe('AccountsService', () => {
  const transaction = {
    user: { updateMany: jest.fn(), findUnique: jest.fn() },
    profile: { update: jest.fn() },
  };
  const root = {
    user: {
      updateMany: jest.fn(() => {
        throw new Error('Root write');
      }),
      findUnique: jest.fn(() => {
        throw new Error('Root read');
      }),
    },
    profile: {
      update: jest.fn(() => {
        throw new Error('Root profile write');
      }),
    },
    $transaction: jest.fn((callback) => callback(transaction)),
  };
  const service = new AccountsService(root as unknown as PrismaService);
  const now = new Date('2026-10-22T23:30:00Z');
  const deletion = {
    id: 'self',
    status: AccountStatus.DELETION_PENDING,
    deletionRequestedAt: now,
    deletionExpiresAt: new Date(now.getTime() + ACCOUNT_DELETION_WINDOW_MS),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    transaction.user.updateMany.mockResolvedValue({ count: 1 });
    transaction.user.findUnique.mockResolvedValue(deletion);
    transaction.profile.update.mockResolvedValue({
      displayName: 'Player',
      whatsappNumber: '+447700900001',
      birthDate: new Date('1995-01-01Z'),
    });
  });
  afterEach(() => jest.useRealTimers());

  it('normalizes only explicit editable fields with status check and write in the same transaction', async () => {
    await service.updateProfile('self', {
      displayName: ' Player ',
      whatsappNumber: '0044 (7700) 900001',
    });
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'self', status: 'APPROVED' },
      data: { updatedAt: now },
    });
    expect(transaction.profile.update).toHaveBeenCalledWith({
      where: { userId: 'self' },
      data: { displayName: 'Player', whatsappNumber: '+447700900001' },
      select: ownProfileSelect,
    });
    expect(
      transaction.user.updateMany.mock.invocationCallOrder[0],
    ).toBeLessThan(transaction.profile.update.mock.invocationCallOrder[0]);
    expect(root.user.findUnique).not.toHaveBeenCalled();
    expect(root.profile.update).not.toHaveBeenCalled();
  });
  it('partial edits do not overwrite omitted profile fields', async () => {
    await service.updateProfile('self', { displayName: 'Name' });
    expect(transaction.profile.update.mock.calls[0][0].data).toEqual({
      displayName: 'Name',
    });
  });
  it.each([
    [{}, 'PROFILE_UPDATE_REQUIRED'],
    [{ displayName: '   ' }, 'INVALID_DISPLAY_NAME'],
    [{ whatsappNumber: '77999999999' }, 'INVALID_WHATSAPP'],
  ])('rejects invalid profile input before writing: %j', async (dto, code) => {
    await expect(service.updateProfile('self', dto)).rejects.toMatchObject({
      status: 400,
      response: { code },
    });
    expect(root.$transaction).not.toHaveBeenCalled();
  });
  it('rechecks APPROVED at the write even when the HTTP guard previously passed', async () => {
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.updateProfile('self', { displayName: 'Name' }),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'AUTH_ACCOUNT_UNAVAILABLE' },
    });
    expect(transaction.profile.update).not.toHaveBeenCalled();
  });
  it.each([
    ['P2002', 'PROFILE_CONFLICT', 409],
    ['P2025', 'PROFILE_NOT_FOUND', 404],
  ])('maps %s safely', async (code, domain, status) => {
    transaction.profile.update.mockRejectedValueOnce(
      knownError(code as string),
    );
    await expect(
      service.updateProfile('self', { displayName: 'Name' }),
    ).rejects.toMatchObject({ status, response: { code: domain } });
  });
  it('does not mask unexpected errors', async () => {
    const failure = new Error('unexpected');
    transaction.profile.update.mockRejectedValueOnce(failure);
    await expect(
      service.updateProfile('self', { displayName: 'Name' }),
    ).rejects.toBe(failure);
  });
  it('requests deletion atomically with an exact 90-day UTC window and conditional version increment', async () => {
    expect(await service.requestDeletion('self')).toEqual(deletion);
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'self', status: 'APPROVED' },
      data: {
        status: 'DELETION_PENDING',
        deletionRequestedAt: now,
        deletionExpiresAt: new Date(now.getTime() + 90 * 86400000),
        authVersion: { increment: 1 },
      },
    });
    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'self' },
      select: accountDeletionSelect,
    });
    expect(root.user.updateMany).not.toHaveBeenCalled();
    expect(transaction.profile.update).not.toHaveBeenCalled();
  });
  it('repeated deletion preserves the original expiry, including after expiry until a separate policy is implemented', async () => {
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    jest.setSystemTime(new Date(now.getTime() + 100 * 86400000));
    expect(await service.requestDeletion('self')).toEqual(deletion);
  });
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.ANONYMIZED,
  ])('never overwrites incompatible state %s', async (status) => {
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    transaction.user.findUnique.mockResolvedValueOnce({ ...deletion, status });
    await expect(service.requestDeletion('self')).rejects.toMatchObject({
      status: 409,
      response: { code: 'ACCOUNT_DELETION_NOT_ALLOWED' },
    });
  });
  it('does not silently create a new window for an inconsistent DELETION_PENDING record', async () => {
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    transaction.user.findUnique.mockResolvedValueOnce({
      ...deletion,
      deletionExpiresAt: null,
    });
    await expect(service.requestDeletion('self')).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DELETION_NOT_ALLOWED' },
    });
  });
  it('handles a missing user without creating a record', async () => {
    transaction.user.updateMany.mockResolvedValueOnce({ count: 0 });
    transaction.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.requestDeletion('self')).rejects.toMatchObject({
      status: 404,
      response: { code: 'USER_NOT_FOUND' },
    });
  });
  it('selects only safe profile/lifecycle fields', () => {
    expect(ownProfileSelect).toEqual({
      displayName: true,
      whatsappNumber: true,
      birthDate: true,
    });
    expect(accountDeletionSelect).toEqual({
      id: true,
      status: true,
      deletionRequestedAt: true,
      deletionExpiresAt: true,
    });
  });
});

// A transactional double with a write mutex models conditional User writes.
// Both operations must acquire the same row before touching Profile. Failed
// transactions discard all writes. No real database or credentials are used.
describe('Account concurrency and rollback', () => {
  const repository = () => {
    let state = {
      id: 'self',
      status: 'APPROVED',
      authVersion: 4,
      email: 'self@example.com',
      passwordHash: 'synthetic-hash',
      updatedAt: new Date('2026-01-01Z'),
      deletionRequestedAt: null as Date | null,
      deletionExpiresAt: null as Date | null,
      profile: {
        displayName: 'Before',
        whatsappNumber: '+447700900001',
        birthDate: new Date('1995-01-01Z'),
      },
      history: ['retained-history'],
      clubRoles: ['MASTER'],
    };
    let tail = Promise.resolve();
    let pause: (() => Promise<void>) | undefined;
    let failProfile = false;
    const clients: unknown[] = [];
    const root = {
      user: {
        findUnique: () => {
          throw new Error('Root read');
        },
        updateMany: () => {
          throw new Error('Root write');
        },
      },
      profile: {
        update: () => {
          throw new Error('Root write');
        },
      },
      $transaction: async (callback) => {
        let release: (() => void) | undefined;
        let local: typeof state | undefined;
        const tx = {
          user: {
            updateMany: async ({ where, data }) => {
              const previous = tail;
              tail = new Promise<void>((resolve) => {
                release = resolve;
              });
              await previous;
              local = structuredClone(state);
              if (where.id !== local.id || where.status !== local.status)
                return { count: 0 };
              Object.assign(local, data, {
                authVersion: data.authVersion
                  ? local.authVersion + data.authVersion.increment
                  : local.authVersion,
              });
              return { count: 1 };
            },
            findUnique: async ({ where, select }) => {
              if (!local) throw new Error('Read before conditional write');
              return where.id === local.id
                ? Object.fromEntries(
                    Object.keys(select).map((key) => [key, local![key]]),
                  )
                : null;
            },
          },
          profile: {
            update: async ({ where, data, select }) => {
              if (
                !local ||
                local.status !== 'APPROVED' ||
                where.userId !== local.id
              )
                throw new Error('Unauthorized Profile write');
              if (pause) await pause();
              if (failProfile) throw knownError('P2002');
              Object.assign(local.profile, data);
              return Object.fromEntries(
                Object.keys(select).map((key) => [key, local!.profile[key]]),
              );
            },
          },
        };
        clients.push(tx);
        try {
          const result = await callback(tx);
          if (local) state = local;
          return result;
        } finally {
          release?.();
        }
      },
    };
    return {
      service: new AccountsService(root as unknown as PrismaService),
      state: () => state,
      clients,
      pause: (fn: () => Promise<void>) => {
        pause = fn;
      },
      failProfile: () => {
        failProfile = true;
      },
    };
  };
  it('two deletion requests retain a single window and increment, without deleting profile, roles or history', async () => {
    const repo = repository();
    const before = structuredClone(repo.state());
    const results = await Promise.all([
      repo.service.requestDeletion('self'),
      repo.service.requestDeletion('self'),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(repo.state()).toMatchObject({
      status: 'DELETION_PENDING',
      authVersion: 5,
      profile: before.profile,
      history: before.history,
      clubRoles: before.clubRoles,
      email: before.email,
      passwordHash: before.passwordHash,
    });
    expect(repo.clients[0]).not.toBe(repo.clients[1]);
  });
  it('a profile edit already holding the account write completes before concurrent deletion', async () => {
    const repo = repository();
    let entered!: () => void, release!: () => void;
    const gate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const resume = new Promise<void>((resolve) => {
      release = resolve;
    });
    repo.pause(async () => {
      entered();
      await resume;
    });
    const update = repo.service.updateProfile('self', {
      displayName: 'Before deletion',
    });
    await gate;
    const deletion = repo.service.requestDeletion('self');
    await Promise.resolve();
    expect(repo.state().status).toBe('APPROVED');
    release();
    await Promise.all([update, deletion]);
    expect(repo.state()).toMatchObject({
      status: 'DELETION_PENDING',
      authVersion: 5,
      profile: { displayName: 'Before deletion' },
    });
  });
  it('when deletion wins first, a concurrent profile edit cannot use a stale guard approval', async () => {
    const repo = repository();
    const results = await Promise.allSettled([
      repo.service.requestDeletion('self'),
      repo.service.updateProfile('self', { displayName: 'Too late' }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { response: { code: 'AUTH_ACCOUNT_UNAVAILABLE' } },
    });
    expect(repo.state().profile.displayName).toBe('Before');
  });
  it('concurrent partial edits preserve both fields without overwriting omitted data', async () => {
    const repo = repository();
    await Promise.all([
      repo.service.updateProfile('self', { displayName: 'After' }),
      repo.service.updateProfile('self', { whatsappNumber: '+447700900002' }),
    ]);
    expect(repo.state().profile).toMatchObject({
      displayName: 'After',
      whatsappNumber: '+447700900002',
    });
  });
  it('a uniqueness failure rolls back the account timestamp as well as the Profile edit', async () => {
    const repo = repository();
    const before = structuredClone(repo.state());
    repo.failProfile();
    await expect(
      repo.service.updateProfile('self', { whatsappNumber: '+447700900002' }),
    ).rejects.toMatchObject({ response: { code: 'PROFILE_CONFLICT' } });
    expect(repo.state()).toEqual(before);
  });
});
