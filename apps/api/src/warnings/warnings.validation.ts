import { BadRequestException } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  WARNING_MAX_ID_LENGTH,
  WARNING_MAX_OFFSET,
  WARNING_MAX_PAGE_LIMIT,
  WARNING_MAX_REASON_LENGTH,
} from './warnings.constants';

const invalidWarningInput = (): never => {
  throw new BadRequestException({
    code: 'BAD_REQUEST',
    message: 'Dados de advertência inválidos',
  });
};

export function warningId(value: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.includes('\0') ||
    [...value].length > WARNING_MAX_ID_LENGTH
  )
    return invalidWarningInput();
  return value;
}

export function warningReason(value: string): string {
  if (typeof value !== 'string') return invalidWarningInput();
  const reason = value.trim();
  if (
    !reason ||
    reason.includes('\0') ||
    [...reason].length > WARNING_MAX_REASON_LENGTH
  )
    return invalidWarningInput();
  return reason;
}

export function warningPaginationSkip(query: PaginationQueryDto): number {
  const skip = (query.page - 1) * query.limit;
  if (
    !Number.isSafeInteger(query.page) ||
    query.page < 1 ||
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > WARNING_MAX_PAGE_LIMIT ||
    !Number.isSafeInteger(skip) ||
    skip > WARNING_MAX_OFFSET
  )
    return invalidWarningInput();
  return skip;
}
