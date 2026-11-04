import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AccountStatus } from '../generated/prisma/enums';
import { sanctionId } from './sanctions.policy';

// Limited access bypasses sanctions, never authenticated account eligibility.
export async function assertDisciplinaryOwner(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: sanctionId(userId) },
    select: { status: true },
  });
  if (!user || user.status !== AccountStatus.APPROVED)
    throw new UnauthorizedException({
      code: 'AUTH_ACCOUNT_UNAVAILABLE',
      message: 'Autenticação necessária ou sessão inválida',
    });
}
