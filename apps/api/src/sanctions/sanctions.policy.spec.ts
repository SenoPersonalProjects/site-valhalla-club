import { BadRequestException } from '@nestjs/common';
import {
  SanctionScopeType,
  SanctionStatus,
  SanctionType,
} from '../generated/prisma/enums';
import { CreateSanctionDto, SanctionFiltersDto } from './sanctions.dto';
import { SANCTION_SCOPES } from './sanctions.constants';
import {
  sanctionCreation,
  sanctionId,
  sanctionListWhere,
  sanctionPagination,
  sanctionState,
} from './sanctions.policy';
import { Prisma } from '../generated/prisma/client';
import { isTransactionWriteConflict } from '../common/database/transaction-conflict';

const at = new Date('2030-01-01T00:00:00Z');
const input = (extra: Partial<CreateSanctionDto> = {}): CreateSanctionDto => ({
  userId: 'target',
  type: SanctionType.TABLE_CREATION_RESTRICTION,
  scopeType: SanctionScopeType.GENERAL,
  reason: ' Motivo fictício ',
  endsAt: '2030-02-01T00:00:00Z',
  ...extra,
});

describe('Sanction policy', () => {
  for (const type of Object.values(SanctionType))
    for (const scopeType of Object.values(SanctionScopeType)) {
      const allowed = (
        SANCTION_SCOPES[type] as readonly SanctionScopeType[]
      ).includes(scopeType);
      it(`${type} ${allowed ? 'accepts' : 'rejects'} ${scopeType}`, () => {
        const dto = input({
          type,
          scopeType,
          ...(type === SanctionType.EXPULSION ? { endsAt: undefined } : {}),
          ...(scopeType === 'CAMPAIGN' ? { campaignId: 'campaign' } : {}),
          ...(scopeType === 'SESSION' ? { sessionId: 'session' } : {}),
          ...(scopeType === 'OTHER'
            ? { scopeDescription: 'Atividade fictícia' }
            : {}),
        });
        if (allowed)
          expect(sanctionCreation(dto, at).scopeType).toBe(scopeType);
        else
          expect(() => sanctionCreation(dto, at)).toThrow(BadRequestException);
      });
    }
  it('normalizes text, defaults to now and preserves caller date objects', () => {
    const data = sanctionCreation(input(), at);
    expect(data.reason).toBe('Motivo fictício');
    expect(data.startsAt).toEqual(at);
    expect(data.startsAt).not.toBe(at);
  });
  it.each([
    { reason: '' },
    { reason: ' ' },
    { reason: 'x'.repeat(1001) },
    { reason: 'a\0b' },
    { userId: '' },
    { userId: 'x'.repeat(129) },
    { reportId: null },
    { warningId: null },
    { campaignId: 'campaign' },
    { sessionId: 'session' },
    { scopeDescription: 'extra' },
    { type: 'UNKNOWN' },
    { scopeType: null },
    { startsAt: null },
    { endsAt: null },
    { startsAt: '2030-01-01T00:00:00' },
    { startsAt: '2030-02-30T00:00:00Z' },
    { startsAt: '2029-12-31T23:59:59Z' },
    { endsAt: undefined },
    { endsAt: '2030-01-01T00:00:00Z' },
    { startsAt: '2030-03-01T00:00:00Z' },
    { type: 'EXPULSION', endsAt: '2030-02-01T00:00:00Z' },
    { type: 'TABLE_PARTICIPATION_RESTRICTION', scopeType: 'CAMPAIGN' },
    { type: 'TABLE_PARTICIPATION_RESTRICTION', scopeType: 'SESSION' },
    { type: 'CLUB_ACTIVITY_RESTRICTION', scopeType: 'OTHER' },
  ])('rejects malformed direct-service input %j', (extra) => {
    expect(() =>
      sanctionCreation(input(extra as Partial<CreateSanctionDto>), at),
    ).toThrow(BadRequestException);
  });
  it('accepts explicit offsets and schedules future sanctions', () => {
    const data = sanctionCreation(
      input({ startsAt: '2030-01-01T00:00:01-03:00' }),
      at,
    );
    expect(data.startsAt.toISOString()).toBe('2030-01-01T03:00:01.000Z');
    expect(
      sanctionState({ ...data, status: SanctionStatus.ACTIVE }, at).isEffective,
    ).toBe(false);
  });
  it.each([
    ['ACTIVE', '2030-01-01T00:00:00Z', 'EXPIRED', false],
    ['ACTIVE', '2030-01-01T00:00:00.001Z', 'ACTIVE', true],
    ['REVERSED', '2029-01-01T00:00:00Z', 'REVERSED', false],
    ['EXPIRED', '2035-01-01T00:00:00Z', 'EXPIRED', false],
  ])(
    'effective status at the deadline: %s %s',
    (status, end, expected, effective) => {
      expect(
        sanctionState(
          {
            status: status as SanctionStatus,
            startsAt: new Date('2029-01-01Z'),
            endsAt: new Date(end),
          },
          at,
        ),
      ).toEqual({ status: expected, isEffective: effective });
    },
  );
  it('indefinite expulsion is effective at its start', () => {
    expect(
      sanctionState(
        { status: SanctionStatus.ACTIVE, startsAt: at, endsAt: null },
        at,
      ),
    ).toEqual({ status: 'ACTIVE', isEffective: true });
  });
  it('effective filters separate overdue, indefinite, reversed and scheduled records', () => {
    expect(
      sanctionListWhere(
        Object.assign(new SanctionFiltersDto(), { status: 'ACTIVE' }),
        at,
      ),
    ).toEqual({
      status: 'ACTIVE',
      OR: [{ endsAt: null }, { endsAt: { gt: at } }],
    });
    expect(
      sanctionListWhere(
        Object.assign(new SanctionFiltersDto(), { status: 'EXPIRED' }),
        at,
      ),
    ).toEqual({
      OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', endsAt: { lte: at } }],
    });
    expect(
      sanctionListWhere(
        Object.assign(new SanctionFiltersDto(), { status: 'REVERSED' }),
        at,
      ),
    ).toEqual({ status: 'REVERSED' });
  });
  it.each([
    { page: 0 },
    { limit: 51 },
    { page: Number.MAX_SAFE_INTEGER },
    { limit: NaN },
  ])('rejects invalid pagination %j', (extra) => {
    expect(() =>
      sanctionPagination(Object.assign(new SanctionFiltersDto(), extra)),
    ).toThrow(BadRequestException);
  });
  it('does not expose input values through validation errors', () => {
    try {
      sanctionId('PRIVATE\0MARKER');
      fail('Expected validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify(error)).not.toContain('PRIVATE');
    }
  });
  it('retries only known transaction write conflicts', () => {
    expect(
      isTransactionWriteConflict(
        new Prisma.PrismaClientKnownRequestError('private', {
          code: 'P2034',
          clientVersion: '7',
        }),
      ),
    ).toBe(true);
    const adapter = new Error('private', {
      cause: { kind: 'TransactionWriteConflict' },
    });
    adapter.name = 'DriverAdapterError';
    expect(isTransactionWriteConflict(adapter)).toBe(true);
    expect(isTransactionWriteConflict(new Error('private'))).toBe(false);
    expect(isTransactionWriteConflict({ code: 'P2034' })).toBe(false);
  });
});
