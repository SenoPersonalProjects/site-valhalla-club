import { Prisma } from '../generated/prisma/client';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function adapterCause(error: unknown) {
  return error instanceof Error &&
    error.name === 'DriverAdapterError' &&
    record(error.cause)
    ? error.cause
    : undefined;
}

export function isWarningWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return error.code === 'P2034';
  // Prisma 7's pg adapter can expose a commit conflict directly, without P2034.
  // Match the structured discriminator, never SQL text or arbitrary messages.
  return adapterCause(error)?.kind === 'TransactionWriteConflict';
}

function reportConstraint(value: unknown): boolean {
  return (
    value === 'Warning_reportId_key' ||
    (Array.isArray(value) && value.length === 1 && value[0] === 'reportId')
  );
}

export function isWarningReportUniqueConflict(error: unknown): boolean {
  let cause = adapterCause(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code !== 'P2002') return false;
    const meta = error.meta;
    if (meta?.modelName !== undefined && meta.modelName !== 'Warning')
      return false;
    if (reportConstraint(meta?.target)) return true;
    cause = adapterCause(meta?.driverAdapterError);
  }
  if (
    cause?.kind !== 'UniqueConstraintViolation' ||
    (cause.table !== undefined && cause.table !== 'Warning') ||
    !record(cause.constraint)
  )
    return false;
  return (
    reportConstraint(cause.constraint.index) ||
    reportConstraint(cause.constraint.fields)
  );
}
