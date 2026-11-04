import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  SanctionScopeType,
  SanctionStatus,
  SanctionType,
} from '../generated/prisma/enums';
import { sanctionId, sanctionReference } from './sanctions.policy';

type RestrictionClient = Pick<Prisma.TransactionClient, 'sanction'>;
type TableContext = Readonly<{ campaignId?: string; sessionId?: string }>;
type Operation = 'ACCOUNT' | 'CREATE_TABLE' | 'MASTER';
const accountTypes = [SanctionType.ACCOUNT_SUSPENSION, SanctionType.EXPULSION];

export function sanctionRestrictionWhere(
  userId: string,
  operation: Operation,
  context: TableContext = {},
  at = new Date(),
): Prisma.SanctionWhereInput {
  const reference = sanctionReference(at);
  const alternatives: Prisma.SanctionWhereInput[] = [
    { type: { in: accountTypes }, scopeType: SanctionScopeType.GENERAL },
  ];
  if (operation === 'CREATE_TABLE')
    alternatives.push({
      type: {
        in: [
          SanctionType.TABLE_CREATION_RESTRICTION,
          SanctionType.MASTER_ACTIVITY_RESTRICTION,
        ],
      },
      scopeType: SanctionScopeType.GENERAL,
    });
  if (operation === 'MASTER') {
    const scopes: Prisma.SanctionWhereInput[] = [
      { scopeType: SanctionScopeType.GENERAL },
    ];
    if (context.campaignId !== undefined)
      scopes.push({
        scopeType: SanctionScopeType.CAMPAIGN,
        campaignId: sanctionId(context.campaignId),
      });
    if (context.sessionId !== undefined)
      scopes.push({
        scopeType: SanctionScopeType.SESSION,
        sessionId: sanctionId(context.sessionId),
      });
    alternatives.push({
      type: SanctionType.MASTER_ACTIVITY_RESTRICTION,
      OR: scopes,
    });
  }
  return {
    userId: sanctionId(userId),
    status: SanctionStatus.ACTIVE,
    startsAt: { lte: reference },
    AND: [
      { OR: [{ endsAt: null }, { endsAt: { gt: reference } }] },
      { OR: alternatives },
    ],
  };
}

export async function assertSanctionAllows(
  client: RestrictionClient,
  userId: string,
  operation: Operation,
  context: TableContext = {},
): Promise<void> {
  const blocked = await client.sanction.findFirst({
    where: sanctionRestrictionWhere(userId, operation, context),
    select: { id: true },
  });
  if (blocked)
    throw new ForbiddenException({
      code: operation === 'ACCOUNT' ? 'ACCOUNT_SANCTIONED' : 'TABLE_SANCTIONED',
      message: 'Operação indisponível por restrição disciplinar vigente',
    });
}
