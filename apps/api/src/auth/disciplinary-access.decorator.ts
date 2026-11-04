import { SetMetadata } from '@nestjs/common';

// JWT and account validation still run; this only skips the account sanction.
export const DISCIPLINARY_ACCESS = 'auth:disciplinary-access';
export const AllowDisciplinaryAccess = () =>
  SetMetadata(DISCIPLINARY_ACCESS, true);
