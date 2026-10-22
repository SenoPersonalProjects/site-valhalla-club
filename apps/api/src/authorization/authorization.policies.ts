import { ClubRole, SystemRole } from '../generated/prisma/enums';

type Denial = { code: string; message: string };

export interface RoleRequirement {
  systemRoles?: readonly SystemRole[];
  clubRoles?: readonly ClubRole[];
  errors?: {
    accountNotApproved?: Denial;
    systemRoleRequired?: Denial;
    clubRoleRequired?: Denial;
  };
}

const administratorDenial = {
  code: 'ADMIN_ROLE_REQUIRED',
  message: 'A operação exige um administrador aprovado',
};

export const ADMINISTRATOR_REQUIREMENT: RoleRequirement = {
  systemRoles: [SystemRole.ADMIN, SystemRole.DEV],
  errors: {
    accountNotApproved: administratorDenial,
    systemRoleRequired: administratorDenial,
  },
};

export const MASTER_REQUIREMENT: RoleRequirement = {
  clubRoles: [ClubRole.MASTER],
  errors: {
    accountNotApproved: {
      code: 'MASTER_ACCOUNT_NOT_APPROVED',
      message: 'A conta do mestre precisa estar aprovada',
    },
    clubRoleRequired: {
      code: 'MASTER_ROLE_REQUIRED',
      message: 'O usuário não possui o papel de mestre',
    },
  },
};
