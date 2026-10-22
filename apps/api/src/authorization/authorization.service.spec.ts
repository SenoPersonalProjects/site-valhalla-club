import { AccountStatus, ClubRole, SystemRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './authorization.service';
import {
  ADMINISTRATOR_REQUIREMENT,
  MASTER_REQUIREMENT,
} from './authorization.policies';

describe('AuthorizationService', () => {
  const findUnique = jest.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const service = new AuthorizationService(prisma);
  const user = (systemRole = SystemRole.USER, roles: ClubRole[] = []) => ({
    status: AccountStatus.APPROVED,
    systemRole,
    clubRoles: roles.map((role) => ({ role })),
  });
  beforeEach(() => jest.resetAllMocks());

  it.each([
    { role: SystemRole.USER, allowed: false },
    { role: SystemRole.ADMIN, allowed: true },
    { role: SystemRole.DEV, allowed: true },
  ])(
    'system $role administrative access: $allowed',
    async ({ role, allowed }) => {
      findUnique.mockResolvedValue(user(role));
      const result = service.assertRoles('actor', ADMINISTRATOR_REQUIREMENT);
      if (allowed) await expect(result).resolves.toBeUndefined();
      else
        await expect(result).rejects.toMatchObject({
          response: { code: 'ADMIN_ROLE_REQUIRED' },
        });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'actor' },
        select: { status: true, systemRole: true },
      });
    },
  );

  it('does not promote a club administrator into system administration', async () => {
    findUnique.mockResolvedValue(user(SystemRole.USER, [ClubRole.ADMIN]));
    await expect(
      service.assertRoles('actor', ADMINISTRATOR_REQUIREMENT),
    ).rejects.toMatchObject({ response: { code: 'ADMIN_ROLE_REQUIRED' } });
  });

  it.each(
    [SystemRole.ADMIN, SystemRole.DEV].flatMap((role) =>
      Object.values(AccountStatus)
        .filter((status) => status !== AccountStatus.APPROVED)
        .map((status) => ({ role, status })),
    ),
  )(
    'denies $role / $status in direct service calls',
    async ({ role, status }) => {
      findUnique.mockResolvedValue({ ...user(role), status });
      await expect(
        service.assertRoles('actor', ADMINISTRATOR_REQUIREMENT),
      ).rejects.toMatchObject({ response: { code: 'ADMIN_ROLE_REQUIRED' } });
    },
  );

  it.each([
    { roles: [ClubRole.MASTER], allowed: true },
    { roles: [ClubRole.PLAYER], allowed: false },
    { roles: [ClubRole.ADMIN], allowed: false },
    { roles: [ClubRole.PLAYER, ClubRole.ADMIN], allowed: false },
    { roles: [ClubRole.PLAYER, ClubRole.MASTER], allowed: true },
    { roles: [ClubRole.MASTER, ClubRole.ADMIN], allowed: true },
  ])(
    'checks cumulative club roles $roles (master: $allowed)',
    async ({ roles, allowed }) => {
      findUnique.mockResolvedValue(user(SystemRole.USER, roles));
      const result = service.assertRoles('actor', MASTER_REQUIREMENT);
      if (allowed) await expect(result).resolves.toBeUndefined();
      else
        await expect(result).rejects.toMatchObject({
          response: { code: 'MASTER_ROLE_REQUIRED' },
        });
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'actor' },
        select: { status: true, clubRoles: { select: { role: true } } },
      });
    },
  );

  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'does not infer MASTER from system %s',
    async (role) => {
      findUnique.mockResolvedValue(user(role));
      await expect(
        service.assertRoles('actor', MASTER_REQUIREMENT),
      ).rejects.toMatchObject({ response: { code: 'MASTER_ROLE_REQUIRED' } });
    },
  );

  it.each(
    Object.values(AccountStatus).filter(
      (status) => status !== AccountStatus.APPROVED,
    ),
  )('denies a MASTER with status %s', async (status) => {
    findUnique.mockResolvedValue({
      ...user(SystemRole.USER, [ClubRole.MASTER]),
      status,
    });
    await expect(
      service.assertRoles('actor', MASTER_REQUIREMENT),
    ).rejects.toMatchObject({
      response: { code: 'MASTER_ACCOUNT_NOT_APPROVED' },
    });
  });

  it('reports an absent user without exposing account data', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      service.assertRoles('absent', MASTER_REQUIREMENT),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'USER_NOT_FOUND' },
    });
  });

  it.each([
    { role: SystemRole.DEV, roles: [ClubRole.PLAYER], code: undefined },
    { role: SystemRole.ADMIN, roles: [ClubRole.MASTER], code: undefined },
    {
      role: SystemRole.USER,
      roles: [ClubRole.MASTER],
      code: 'SYSTEM_ROLE_REQUIRED',
    },
    {
      role: SystemRole.ADMIN,
      roles: [ClubRole.ADMIN],
      code: 'CLUB_ROLE_REQUIRED',
    },
  ])(
    'requires both independent groups: $role / $roles',
    async ({ role, roles, code }) => {
      findUnique.mockResolvedValue(user(role, roles));
      const result = service.assertRoles('actor', {
        systemRoles: [SystemRole.ADMIN, SystemRole.DEV],
        clubRoles: [ClubRole.PLAYER, ClubRole.MASTER],
      });
      if (code)
        await expect(result).rejects.toMatchObject({ response: { code } });
      else await expect(result).resolves.toBeUndefined();
    },
  );

  it('supports a future DEV-only requirement without implicit ADMIN hierarchy', async () => {
    findUnique.mockResolvedValue(user(SystemRole.ADMIN));
    await expect(
      service.assertRoles('actor', { systemRoles: [SystemRole.DEV] }),
    ).rejects.toMatchObject({ response: { code: 'SYSTEM_ROLE_REQUIRED' } });
    findUnique.mockResolvedValue(user(SystemRole.DEV));
    await expect(
      service.assertRoles('actor', { systemRoles: [SystemRole.DEV] }),
    ).resolves.toBeUndefined();
  });

  it.each([{ systemRoles: [] }, { clubRoles: [] }])(
    'fails closed for an empty role requirement %j',
    async (requirement) => {
      findUnique.mockResolvedValue(user(SystemRole.DEV, [ClubRole.MASTER]));
      await expect(
        service.assertRoles('actor', requirement),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  it('rejects non-approved accounts using the generic contract too', async () => {
    findUnique.mockResolvedValue({
      ...user(SystemRole.ADMIN),
      status: AccountStatus.PENDING,
    });
    await expect(
      service.assertRoles('actor', { systemRoles: [SystemRole.ADMIN] }),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_NOT_APPROVED' } });
  });

  it('uses the provided transaction for the authoritative read, never the root client', async () => {
    findUnique.mockImplementation(() => {
      throw new Error('root authorization read');
    });
    const txRead = jest
      .fn()
      .mockResolvedValue(user(SystemRole.DEV, [ClubRole.MASTER]));
    const client = { user: { findUnique: txRead } } as unknown as PrismaService;
    await service.assertRoles('actor', ADMINISTRATOR_REQUIREMENT, client);
    await service.assertRoles('actor', MASTER_REQUIREMENT, client);
    expect(txRead).toHaveBeenCalledTimes(2);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
