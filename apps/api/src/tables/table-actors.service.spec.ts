import { AccountStatus, ClubRole, SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { TableActorsService } from './table-actors.service';

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
      clubRoles: [],
    });

    await expect(
      service.assertAdministrator('admin-1'),
    ).resolves.toBeUndefined();
  });

  it('accepts an approved developer', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.DEV,
      clubRoles: [],
    });

    await expect(service.assertAdministrator('dev-1')).resolves.toBeUndefined();
  });

  it('accepts an approved club administrator', async () => {
    userRepository.findUnique.mockResolvedValue({
      status: AccountStatus.APPROVED,
      systemRole: SystemRole.USER,
      clubRoles: [{ id: 'role-1', role: ClubRole.ADMIN }],
    });
    await expect(
      service.assertAdministrator('admin-1'),
    ).resolves.toBeUndefined();
  });

  it.each(
    Object.values(AccountStatus).filter(
      (status) => status !== AccountStatus.APPROVED,
    ),
  )('rejects a developer with account status %s', async (status) => {
    userRepository.findUnique.mockResolvedValue({
      status,
      systemRole: SystemRole.DEV,
      clubRoles: [],
    });
    await expect(service.assertAdministrator('dev-1')).rejects.toMatchObject({
      response: { code: 'ADMIN_ROLE_REQUIRED' },
    });
  });

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
});
