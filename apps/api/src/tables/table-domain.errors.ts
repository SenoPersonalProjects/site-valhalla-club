import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

type DomainExceptionPayload = {
  code: string;
  message: string;
};

export function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({
    code,
    message,
  } satisfies DomainExceptionPayload);
}

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException({
    code,
    message,
  } satisfies DomainExceptionPayload);
}

export function forbidden(code: string, message: string): ForbiddenException {
  return new ForbiddenException({
    code,
    message,
  } satisfies DomainExceptionPayload);
}

export function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({
    code,
    message,
  } satisfies DomainExceptionPayload);
}
