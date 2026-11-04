import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AppealStatus, WarningStatus } from '../generated/prisma/enums';
import {
  invalidSanction,
  sanctionId,
  sanctionReference,
} from '../sanctions/sanctions.policy';
import { AdminAppealFiltersDto, AppealTargetDto } from './appeals.dto';
import { appealCaseSelect } from './appeals.select';

export function appealCaseRefs(dto: AppealTargetDto, required = true) {
  if (
    (dto.warningId !== undefined && dto.sanctionId !== undefined) ||
    (required && dto.warningId === undefined && dto.sanctionId === undefined)
  )
    invalidSanction(
      'APPEAL_TARGET_INVALID',
      'Informe exatamente uma advertência ou sanção',
    );
  return {
    warningId: dto.warningId === undefined ? null : sanctionId(dto.warningId),
    sanctionId:
      dto.sanctionId === undefined ? null : sanctionId(dto.sanctionId),
  };
}

export async function loadAppealCase(
  tx: Prisma.TransactionClient,
  refs: ReturnType<typeof appealCaseRefs>,
  ownerId?: string,
) {
  const target =
    refs.warningId !== null
      ? await tx.warning.findFirst({
          where: {
            id: refs.warningId,
            ...(ownerId === undefined ? {} : { userId: ownerId }),
          },
          select: appealCaseSelect,
        })
      : await tx.sanction.findFirst({
          where: {
            id: refs.sanctionId!,
            ...(ownerId === undefined ? {} : { userId: ownerId }),
          },
          select: appealCaseSelect,
        });
  if (!target)
    throw new NotFoundException({
      code: 'APPEAL_CASE_NOT_FOUND',
      message: 'Caso não encontrado',
    });
  return target;
}

export function appealConflict(
  code = 'APPEAL_CONFLICT',
  message = 'Conflito no recurso; consulte o estado atual e tente novamente',
) {
  return new ConflictException({ code, message });
}

export function appealFilters(
  query: AdminAppealFiltersDto,
): Prisma.AppealWhereInput {
  const refs = appealCaseRefs(query, false);
  if (
    query.status !== undefined &&
    !Object.values(AppealStatus).includes(query.status)
  )
    invalidSanction();
  return {
    ...(refs.warningId !== null ? { warningId: refs.warningId } : {}),
    ...(refs.sanctionId !== null ? { sanctionId: refs.sanctionId } : {}),
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.userId !== undefined ? { userId: sanctionId(query.userId) } : {}),
  };
}

export function warningState<
  T extends { status: WarningStatus; expiresAt: Date },
>(row: T, at: Date) {
  const reference = sanctionReference(at);
  const status =
    row.status === WarningStatus.ACTIVE && row.expiresAt <= reference
      ? WarningStatus.EXPIRED
      : row.status;
  return { ...row, status, isEffective: status === WarningStatus.ACTIVE };
}

export function warningFilters(
  userId: string,
  status: WarningStatus | undefined,
  at: Date,
): Prisma.WarningWhereInput {
  if (status !== undefined && !Object.values(WarningStatus).includes(status))
    invalidSanction();
  const where: Prisma.WarningWhereInput = { userId: sanctionId(userId) };
  if (status === WarningStatus.ACTIVE)
    Object.assign(where, { status, expiresAt: { gt: at } });
  else if (status === WarningStatus.EXPIRED)
    where.OR = [
      { status: WarningStatus.EXPIRED },
      { status: WarningStatus.ACTIVE, expiresAt: { lte: at } },
    ];
  else if (status === WarningStatus.REVERSED) where.status = status;
  return where;
}

export function isAppealUniqueConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError)
    return error.code === 'P2002';
  if (!(error instanceof Error) || error.name !== 'DriverAdapterError')
    return false;
  const cause: unknown = error.cause;
  return (
    cause !== null &&
    typeof cause === 'object' &&
    'kind' in cause &&
    cause.kind === 'UniqueConstraintViolation'
  );
}
