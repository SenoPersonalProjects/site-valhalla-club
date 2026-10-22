import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClubRole, SystemRole } from '../generated/prisma/enums';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';
import {
  RequireClubRoles,
  RequireRoles,
  RequireSystemRoles,
} from './require-roles.decorator';
import { ADMINISTRATOR_REQUIREMENT } from './authorization.policies';
import { Public } from '../auth/public.decorator';

@RequireSystemRoles(SystemRole.ADMIN, SystemRole.DEV)
class ProtectedController {
  inherited() {}
  @RequireClubRoles(ClubRole.MASTER)
  both() {}
  @RequireSystemRoles(SystemRole.DEV)
  developerOnly() {}
  @Public()
  publicEndpoint() {}
}
class PlainController {
  plain() {}
  @RequireRoles(ADMINISTRATOR_REQUIREMENT)
  administrator() {}
}

describe('AuthorizationGuard metadata and trusted identity', () => {
  const assertRoles = jest.fn();
  const guard = new AuthorizationGuard(new Reflector(), {
    assertRoles,
  } as unknown as AuthorizationService);
  const context = (
    controller: typeof PlainController | typeof ProtectedController,
    method: string,
    req = {},
  ): ExecutionContext =>
    ({
      getHandler: () => controller.prototype[method],
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => req }),
    }) as unknown as ExecutionContext;
  beforeEach(() => jest.resetAllMocks());

  it('leaves authentication of routes without role requirements to AuthGuard', async () => {
    expect(await guard.canActivate(context(PlainController, 'plain'))).toBe(
      true,
    );
    expect(assertRoles).not.toHaveBeenCalled();
  });
  it('preserves an explicit public method under a role-protected controller', async () => {
    expect(
      await guard.canActivate(context(ProtectedController, 'publicEndpoint')),
    ).toBe(true);
    expect(assertRoles).not.toHaveBeenCalled();
  });
  it.each([{}, { errors: ADMINISTRATOR_REQUIREMENT.errors }])(
    'rejects a RequireRoles decorator without any role group: %j',
    (requirement) => {
      expect(() => RequireRoles(requirement)).toThrow('RequireRoles');
    },
  );
  it.each([
    {},
    { user: {} },
    { user: { id: ' ' } },
    { user: { id: 42 } },
    {
      headers: { 'x-user-id': 'admin', role: 'DEV' },
      body: { user: { id: 'admin' } },
      query: { userId: 'admin' },
    },
  ])('requires the authenticated user id: %j', async (req) => {
    await expect(
      guard.canActivate(context(ProtectedController, 'inherited', req)),
    ).rejects.toMatchObject({
      status: 401,
      response: { code: 'USER_CONTEXT_REQUIRED' },
    });
    expect(assertRoles).not.toHaveBeenCalled();
  });
  it('inherits the system OR requirement and combines the independent club requirement', async () => {
    await guard.canActivate(
      context(ProtectedController, 'both', { user: { id: 'actor' } }),
    );
    expect(assertRoles).toHaveBeenCalledWith('actor', {
      systemRoles: [SystemRole.ADMIN, SystemRole.DEV],
      clubRoles: [ClubRole.MASTER],
      errors: undefined,
    });
  });
  it('overrides only the same metadata group on a method', async () => {
    await guard.canActivate(
      context(ProtectedController, 'developerOnly', { user: { id: 'actor' } }),
    );
    expect(assertRoles).toHaveBeenCalledWith('actor', {
      systemRoles: [SystemRole.DEV],
      clubRoles: undefined,
      errors: undefined,
    });
  });
  it('uses the shared domain error policy and propagates a denial', async () => {
    const denial = new Error('denied');
    assertRoles.mockRejectedValueOnce(denial);
    await expect(
      guard.canActivate(
        context(PlainController, 'administrator', { user: { id: 'actor' } }),
      ),
    ).rejects.toBe(denial);
    expect(assertRoles).toHaveBeenCalledWith('actor', {
      systemRoles: ADMINISTRATOR_REQUIREMENT.systemRoles,
      clubRoles: undefined,
      errors: ADMINISTRATOR_REQUIREMENT.errors,
    });
  });
});
