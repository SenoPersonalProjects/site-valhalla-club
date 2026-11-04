import { BadRequestException } from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { Prisma } from '../generated/prisma/client';
import {
  SanctionScopeType,
  SanctionStatus,
  SanctionType,
} from '../generated/prisma/enums';
import {
  SANCTION_MAX_ID_LENGTH,
  SANCTION_MAX_OFFSET,
  SANCTION_MAX_PAGE_LIMIT,
  SANCTION_MAX_REASON_LENGTH,
  SANCTION_MAX_SCOPE_DESCRIPTION_LENGTH,
  SANCTION_SCOPES,
  SANCTION_ZONED_TIMESTAMP,
} from './sanctions.constants';
import { CreateSanctionDto, SanctionFiltersDto } from './sanctions.dto';

export function invalidSanction(
  code = 'BAD_REQUEST',
  message = 'Dados de entrada inválidos',
): never {
  throw new BadRequestException({ code, message });
}

export function sanctionId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\0') ||
    Array.from(value).length > SANCTION_MAX_ID_LENGTH
  )
    invalidSanction();
  return value;
}

function text(value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\0') ||
    Array.from(value.trim()).length > max
  )
    invalidSanction();
  return value.trim();
}

export function sanctionReason(value: unknown): string {
  return text(value, SANCTION_MAX_REASON_LENGTH);
}

function timestamp(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !isISO8601(value, { strict: true, strictSeparator: true }) ||
    !SANCTION_ZONED_TIMESTAMP.test(value)
  )
    invalidSanction();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) invalidSanction();
  return date;
}

export function sanctionReference(at: Date): Date {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime()))
    invalidSanction();
  return new Date(at.getTime());
}

export function sanctionCreation(dto: CreateSanctionDto, at: Date) {
  const reference = sanctionReference(at);
  if (!Object.values(SanctionType).includes(dto.type)) invalidSanction();
  const scopeType =
    dto.scopeType === undefined ? SanctionScopeType.GENERAL : dto.scopeType;
  const allowed: readonly SanctionScopeType[] = SANCTION_SCOPES[dto.type];
  if (!allowed.includes(scopeType))
    invalidSanction(
      'SANCTION_SCOPE_INVALID',
      'Escopo incompatível com a sanção',
    );
  const campaignId =
    dto.campaignId === undefined ? null : sanctionId(dto.campaignId);
  const sessionId =
    dto.sessionId === undefined ? null : sanctionId(dto.sessionId);
  const scopeDescription =
    dto.scopeDescription === undefined
      ? null
      : text(dto.scopeDescription, SANCTION_MAX_SCOPE_DESCRIPTION_LENGTH);
  if (
    (scopeType === SanctionScopeType.GENERAL &&
      (campaignId !== null ||
        sessionId !== null ||
        scopeDescription !== null)) ||
    (scopeType === SanctionScopeType.CAMPAIGN &&
      (campaignId === null ||
        sessionId !== null ||
        scopeDescription !== null)) ||
    (scopeType === SanctionScopeType.SESSION &&
      (sessionId === null ||
        campaignId !== null ||
        scopeDescription !== null)) ||
    (scopeType === SanctionScopeType.OTHER &&
      (scopeDescription === null || campaignId !== null || sessionId !== null))
  )
    invalidSanction(
      'SANCTION_SCOPE_INVALID',
      'Campos incompatíveis com o escopo',
    );
  const startsAt =
    dto.startsAt === undefined ? reference : timestamp(dto.startsAt);
  const endsAt = dto.endsAt === undefined ? null : timestamp(dto.endsAt);
  if (
    startsAt < reference ||
    (dto.type === SanctionType.EXPULSION
      ? endsAt !== null
      : endsAt === null || endsAt <= startsAt)
  )
    invalidSanction(
      'SANCTION_PERIOD_INVALID',
      'Informe início atual ou futuro e término posterior para sanções temporárias',
    );
  return {
    userId: sanctionId(dto.userId),
    type: dto.type,
    scopeType,
    campaignId,
    sessionId,
    scopeDescription,
    reportId: dto.reportId === undefined ? null : sanctionId(dto.reportId),
    warningId: dto.warningId === undefined ? null : sanctionId(dto.warningId),
    reason: sanctionReason(dto.reason),
    startsAt,
    endsAt,
  };
}

type Lifetime = Readonly<{
  status: SanctionStatus;
  startsAt: Date;
  endsAt: Date | null;
}>;

export function sanctionState(sanction: Lifetime, at: Date) {
  const reference = sanctionReference(at);
  const status =
    sanction.status === SanctionStatus.ACTIVE &&
    sanction.endsAt !== null &&
    sanction.endsAt <= reference
      ? SanctionStatus.EXPIRED
      : sanction.status;
  return {
    status,
    isEffective:
      status === SanctionStatus.ACTIVE && sanction.startsAt <= reference,
  };
}

export function sanctionListWhere(query: SanctionFiltersDto, at: Date) {
  const reference = sanctionReference(at);
  for (const [value, choices] of [
    [query.type, Object.values(SanctionType)],
    [query.scopeType, Object.values(SanctionScopeType)],
    [query.status, Object.values(SanctionStatus)],
  ] as const)
    if (value !== undefined && !(choices as readonly string[]).includes(value))
      invalidSanction();
  const where: Prisma.SanctionWhereInput = {};
  for (const key of ['userId', 'campaignId', 'sessionId'] as const)
    if (query[key] !== undefined) where[key] = sanctionId(query[key]);
  if (query.type !== undefined) where.type = query.type;
  if (query.scopeType !== undefined) where.scopeType = query.scopeType;
  if (query.status === SanctionStatus.ACTIVE) {
    where.status = SanctionStatus.ACTIVE;
    where.OR = [{ endsAt: null }, { endsAt: { gt: reference } }];
  } else if (query.status === SanctionStatus.EXPIRED) {
    where.OR = [
      { status: SanctionStatus.EXPIRED },
      { status: SanctionStatus.ACTIVE, endsAt: { lte: reference } },
    ];
  } else if (query.status === SanctionStatus.REVERSED)
    where.status = SanctionStatus.REVERSED;
  return where;
}

export function sanctionPagination(query: SanctionFiltersDto) {
  const skip = (query.page - 1) * query.limit;
  if (
    !Number.isSafeInteger(query.page) ||
    query.page < 1 ||
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > SANCTION_MAX_PAGE_LIMIT ||
    !Number.isSafeInteger(skip) ||
    skip > SANCTION_MAX_OFFSET
  )
    invalidSanction();
  return skip;
}
