import { Prisma } from '../../generated/prisma/client';

export function isTransactionWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return error.code === 'P2034';
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError')
    return false;
  const cause: unknown = error.cause;
  return (
    cause !== null &&
    typeof cause === 'object' &&
    'kind' in cause &&
    cause.kind === 'TransactionWriteConflict'
  );
}
