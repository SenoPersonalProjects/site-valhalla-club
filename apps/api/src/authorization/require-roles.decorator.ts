import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ClubRole, SystemRole } from '../generated/prisma/enums';
import { RoleRequirement } from './authorization.policies';

export const SYSTEM_ROLES_KEY = 'authorization:systemRoles';
export const CLUB_ROLES_KEY = 'authorization:clubRoles';
export const ROLE_ERRORS_KEY = 'authorization:errors';

export const RequireSystemRoles = (...roles: [SystemRole, ...SystemRole[]]) =>
  SetMetadata(SYSTEM_ROLES_KEY, roles);

export const RequireClubRoles = (...roles: [ClubRole, ...ClubRole[]]) =>
  SetMetadata(CLUB_ROLES_KEY, roles);

/** Shared policies keep HTTP and direct service denials consistent. */
export function RequireRoles(requirement: RoleRequirement) {
  if (
    requirement.systemRoles === undefined &&
    requirement.clubRoles === undefined
  ) {
    throw new Error('RequireRoles requires at least one role group');
  }
  return applyDecorators(
    ...(requirement.systemRoles !== undefined
      ? [SetMetadata(SYSTEM_ROLES_KEY, requirement.systemRoles)]
      : []),
    ...(requirement.clubRoles !== undefined
      ? [SetMetadata(CLUB_ROLES_KEY, requirement.clubRoles)]
      : []),
    SetMetadata(ROLE_ERRORS_KEY, requirement.errors),
  );
}
