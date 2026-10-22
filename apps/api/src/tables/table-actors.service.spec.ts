import { AccountStatus, ClubRole, SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from './table-actors.service';
import { Prisma } from '../generated/prisma/client';

describe('TableActorsService', () => {
  const userRepository = { findUnique: jest.fn() };
  const gameSystemRepository = { findUnique: jest.fn() };
  const prisma = {
    user: userRepository,
    gameSystem: gameSystemRepository,
  } as unknown as PrismaService;
  const service = new TableActorsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('accepts an approved user with the master club role', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      clubRoles: [{ id: 'role-1', role: ClubRole.MASTER }],
    });

    await expect(service.assertMaster('master-1')).resolves.toBeUndefined();
  });

  it('rejects a master whose account is not approved', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.PENDING,
      clubRoles: [{ id: 'role-1', role: ClubRole.MASTER }],
    });

    await expect(service.assertMaster('master-1')).rejects.toMatchObject({
      response: { code: 'MASTER_ACCOUNT_NOT_APPROVED' },
    });
  });

  it('accepts an approved system administrator', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.ADMIN,
    });

    await expect(
      service.assertAdministrator('admin-1'),
    ).resolves.toBeUndefined();
    expect(userRepository.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      select: { status: true, systemRole: true },
    });
  });

  it('accepts an approved developer', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.DEV,
    });

    await expect(service.assertAdministrator('dev-1')).resolves.toBeUndefined();
  });

  it('checks administrative authority with the supplied transaction only', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({
        status: AccountStatus.APPROVED,
        systemRole: SystemRole.ADMIN,
      });
    const transaction = {
      user: { findUnique },
    } as unknown as Prisma.TransactionClient;
    await expect(
      service.assertAdministrator('admin-1', transaction),
    ).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      select: { status: true, systemRole: true },
    });
    expect(userRepository.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an approved system user with only the club administrator role', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.USER,
      clubRoles: [{ id: 'role-1', role: ClubRole.ADMIN }],
    });
    await expect(service.assertAdministrator('admin-1')).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
  });

  it.each(
    [SystemRole.ADMIN, SystemRole.DEV].flatMap((systemRole) =>
      Object.values(AccountStatus)
        .filter((status) => status !== AccountStatus.APPROVED)
        .map((status) => ({ systemRole, status })),
    ),
  )(
    'rejects $systemRole with account status $status',
    async ({ systemRole, status }) => {
      userRepository.findUnique.mockResolvedValue({
        status,
        systemRole,
      });
      await expect(service.assertAdministrator('dev-1')).rejects.toMatchObject({
        response: { code: 'ADMIN_ROLE_REQUIRED' },
      });
    },
  );

  it('rejects an approved user without administrative roles', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.USER,
      clubRoles: [],
    });
    await expect(service.assertAdministrator('user-1')).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
  });

  it('rejects an inactive game system', async () => {
    gameSystemRepository.findUnique.mockResolvedValue({ active: false });

    await expect(
      service.assertActiveGameSystem('system-1'),
    ).rejects.toMatchObject({
      response: { code: 'GAME_SYSTEM_INACTIVE' },
    });
  });

  it.each([true, false, null])(
    'uses only the supplied transaction for game system activity %s',
    async (active) => {
      const findUnique = jest
        .fn()
        .mockResolvedValue(active === null ? null : { active });
      const tx = {
        gameSystem: { findUnique },
      } as unknown as Prisma.TransactionClient;
      const result = service.assertActiveGameSystem('system-1', tx);
      if (active) await expect(result).resolves.toBeUndefined();
      else
        await expect(result).rejects.toMatchObject({
          response: {
            code:
              active === null
                ? 'GAME_SYSTEM_NOT_FOUND'
                : 'GAME_SYSTEM_INACTIVE',
          },
        });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'system-1' },
        select: { active: true },
      });
      expect(gameSystemRepository.findUnique).not.toHaveBeenCalled();
    },
  );

  it('keeps the root client as the default for other callers', async () => {
    gameSystemRepository.findUnique.mockResolvedValue({ active: true });
    await expect(
      service.assertActiveGameSystem('system-1'),
    ).resolves.toBeUndefined();
    expect(gameSystemRepository.findUnique).toHaveBeenCalledWith({
      where: { id: 'system-1' },
      select: { active: true },
    });
  });
});
