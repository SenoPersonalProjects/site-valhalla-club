import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { WarningSeverity, WarningStatus } from '../generated/prisma/enums';
import { WARNING_MAX_OCCURRENCE_NUMBER } from './warning-policy.constants';
import {
  activeWarningWhereAt,
  calculateWarning,
  effectiveWarningStatusAt,
  warningReferenceTime,
  warningStatusWhereAt,
} from './warning-policy';

const instant = () => new Date('2026-01-01T12:34:56.789Z');

function expectPolicyError(action: () => unknown, code: string) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) throw error;
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({ code });
    return;
  }
  throw new Error('Expected warning policy validation to fail');
}

describe('Warning calculation policy', () => {
  it.each([
    [WarningSeverity.LIGHT, 0, '1', '1', '1'],
    [WarningSeverity.LIGHT, 1, '1', '1.5', '1.5'],
    [WarningSeverity.LIGHT, 2, '1', '2', '2'],
    [WarningSeverity.LIGHT, 3, '1', '2.5', '2.5'],
    [WarningSeverity.MODERATE, 0, '3', '1', '3'],
    [WarningSeverity.MODERATE, 1, '3', '1.5', '4.5'],
    [WarningSeverity.MODERATE, 2, '3', '2', '6'],
    [WarningSeverity.MODERATE, 3, '3', '2.5', '7.5'],
    [WarningSeverity.SEVERE, 0, '6', '1', '6'],
    [WarningSeverity.SEVERE, 1, '6', '1.5', '9'],
    [WarningSeverity.SEVERE, 2, '6', '2', '12'],
    [WarningSeverity.SEVERE, 3, '6', '2.5', '15'],
  ] as const)(
    'calculates %s with %s active predecessors',
    (severity, count, base, multiplier, effective) => {
      const result = calculateWarning(severity, count, instant());
      expect(result.baseWeight).toBeInstanceOf(Prisma.Decimal);
      expect(result.recurrenceMultiplier).toBeInstanceOf(Prisma.Decimal);
      expect(result.effectiveWeight).toBeInstanceOf(Prisma.Decimal);
      expect(result.baseWeight.toString()).toBe(base);
      expect(result.recurrenceMultiplier.toString()).toBe(multiplier);
      expect(result.effectiveWeight.toString()).toBe(effective);
      expect(result.occurrenceNumber).toBe(count + 1);
      expect(result.severity).toBe(severity);
    },
  );

  it.each([4, 100, WARNING_MAX_OCCURRENCE_NUMBER - 1])(
    'caps the multiplier while preserving occurrence number for %s active rows',
    (count) => {
      const result = calculateWarning(WarningSeverity.SEVERE, count, instant());
      expect(result.recurrenceMultiplier.toString()).toBe('2.5');
      expect(result.effectiveWeight.toString()).toBe('15');
      expect(result.occurrenceNumber).toBe(count + 1);
    },
  );

  it.each([
    [WarningSeverity.LIGHT, '2026-04-01T12:34:56.789Z'],
    [WarningSeverity.MODERATE, '2026-06-30T12:34:56.789Z'],
    [WarningSeverity.SEVERE, '2027-01-01T12:34:56.789Z'],
  ] as const)(
    'sets the exact expiry for %s without rounding the clock',
    (severity, expected) => {
      const result = calculateWarning(severity, 0, instant());
      expect(result.createdAt.toISOString()).toBe('2026-01-01T12:34:56.789Z');
      expect(result.expiresAt.toISOString()).toBe(expected);
    },
  );

  it('uses elapsed UTC time across an offset and daylight-saving boundary', () => {
    const result = calculateWarning(
      WarningSeverity.LIGHT,
      0,
      new Date('2026-03-08T01:30:00-05:00'),
    );
    expect(result.createdAt.toISOString()).toBe('2026-03-08T06:30:00.000Z');
    expect(result.expiresAt.toISOString()).toBe('2026-06-06T06:30:00.000Z');
  });

  it('treats 365 days from leap day as an elapsed duration', () => {
    const result = calculateWarning(
      WarningSeverity.SEVERE,
      0,
      new Date('2024-02-29T01:00:00Z'),
    );
    expect(result.expiresAt.toISOString()).toBe('2025-02-28T01:00:00.000Z');
  });

  it.each([
    -1,
    0.5,
    NaN,
    Infinity,
    WARNING_MAX_OCCURRENCE_NUMBER,
    Number.MAX_SAFE_INTEGER,
  ])('rejects an invalid active count %s', (count) => {
    expectPolicyError(
      () => calculateWarning(WarningSeverity.LIGHT, count, instant()),
      'WARNING_RECURRENCE_INVALID',
    );
  });

  it.each(['UNKNOWN', 'toString', 'constructor', '', null, undefined])(
    'rejects an invalid severity %s',
    (value) => {
      expectPolicyError(
        () => calculateWarning(value as WarningSeverity, 0, instant()),
        'WARNING_SEVERITY_INVALID',
      );
    },
  );

  it('rejects invalid reference and overflowing expiry timestamps', () => {
    for (const at of [new Date(NaN), new Date(8_640_000_000_000_000)]) {
      expectPolicyError(
        () => calculateWarning(WarningSeverity.LIGHT, 0, at),
        'WARNING_REFERENCE_TIME_INVALID',
      );
    }
  });

  it('returns independent dates and Decimal values without mutating the source or global precision', () => {
    const at = instant();
    const precision = Prisma.Decimal.precision;
    const first = calculateWarning(WarningSeverity.MODERATE, 1, at);
    const second = calculateWarning(WarningSeverity.MODERATE, 1, at);
    expect(first.createdAt).not.toBe(at);
    expect(first.createdAt).not.toBe(second.createdAt);
    expect(first.baseWeight).not.toBe(second.baseWeight);
    expect(first.recurrenceMultiplier).not.toBe(second.recurrenceMultiplier);
    first.createdAt.setUTCFullYear(2030);
    first.expiresAt.setUTCFullYear(2030);
    expect(at.toISOString()).toBe('2026-01-01T12:34:56.789Z');
    expect(second.expiresAt.toISOString()).toBe('2026-06-30T12:34:56.789Z');
    expect(Prisma.Decimal.precision).toBe(precision);
  });

  it('serializes fractional weights as exact decimal strings', () => {
    const result: unknown = JSON.parse(
      JSON.stringify(calculateWarning(WarningSeverity.MODERATE, 1, instant())),
    );
    expect(result).toMatchObject({
      baseWeight: '3',
      recurrenceMultiplier: '1.5',
      effectiveWeight: '4.5',
      occurrenceNumber: 2,
    });
  });

  it.each([
    [WarningStatus.ACTIVE, -1, WarningStatus.EXPIRED],
    [WarningStatus.ACTIVE, 0, WarningStatus.EXPIRED],
    [WarningStatus.ACTIVE, 1, WarningStatus.ACTIVE],
    [WarningStatus.EXPIRED, -1, WarningStatus.EXPIRED],
    [WarningStatus.EXPIRED, 0, WarningStatus.EXPIRED],
    [WarningStatus.EXPIRED, 1, WarningStatus.EXPIRED],
    [WarningStatus.REVERSED, -1, WarningStatus.REVERSED],
    [WarningStatus.REVERSED, 0, WarningStatus.REVERSED],
    [WarningStatus.REVERSED, 1, WarningStatus.REVERSED],
  ] as const)(
    'presents stored %s with expiry offset %s as %s',
    (status, offset, expected) => {
      const row = { status, expiresAt: new Date(instant().getTime() + offset) };
      const before = structuredClone(row);
      expect(effectiveWarningStatusAt(row, instant())).toBe(expected);
      expect(row).toEqual(before);
    },
  );

  it('keeps the second weight when the first expires or is reversed', () => {
    const first = calculateWarning(WarningSeverity.LIGHT, 0, instant());
    const second = calculateWarning(
      WarningSeverity.LIGHT,
      1,
      new Date('2026-01-02T12:34:56.789Z'),
    );
    const snapshot = JSON.stringify(second);
    expect(
      effectiveWarningStatusAt(
        { ...first, status: WarningStatus.ACTIVE },
        first.expiresAt,
      ),
    ).toBe(WarningStatus.EXPIRED);
    expect(
      effectiveWarningStatusAt(
        { ...first, status: WarningStatus.REVERSED },
        instant(),
      ),
    ).toBe(WarningStatus.REVERSED);
    expect(second.effectiveWeight.toString()).toBe('1.5');
    expect(JSON.stringify(second)).toBe(snapshot);
    const later = calculateWarning(WarningSeverity.LIGHT, 1, first.expiresAt);
    expect(later.occurrenceNumber).toBe(2);
    expect(later.effectiveWeight.toString()).toBe('1.5');
  });

  it('builds active and expired scopes with complementary strict boundaries', () => {
    const at = instant();
    expect(activeWarningWhereAt(at)).toEqual({
      status: WarningStatus.ACTIVE,
      expiresAt: { gt: at },
    });
    expect(warningStatusWhereAt(WarningStatus.ACTIVE, at)).toEqual(
      activeWarningWhereAt(at),
    );
    expect(warningStatusWhereAt(WarningStatus.EXPIRED, at)).toEqual({
      OR: [
        { status: WarningStatus.EXPIRED },
        { status: WarningStatus.ACTIVE, expiresAt: { lte: at } },
      ],
    });
    expect(warningStatusWhereAt(WarningStatus.REVERSED, at)).toEqual({
      status: WarningStatus.REVERSED,
    });
    const where = activeWarningWhereAt(at);
    at.setUTCFullYear(2030);
    expect(where.expiresAt.gt.toISOString()).toBe('2026-01-01T12:34:56.789Z');
  });

  it('rejects invalid state and time rather than broadening a query', () => {
    expect(() =>
      warningStatusWhereAt('UNKNOWN' as WarningStatus, instant()),
    ).toThrow(BadRequestException);
    expect(() =>
      effectiveWarningStatusAt(
        { status: 'UNKNOWN' as WarningStatus, expiresAt: instant() },
        instant(),
      ),
    ).toThrow(BadRequestException);
    expect(() => activeWarningWhereAt(new Date(NaN))).toThrow(
      BadRequestException,
    );
    expect(() => warningReferenceTime(new Date(NaN))).toThrow(
      BadRequestException,
    );
    expect(() =>
      effectiveWarningStatusAt(
        { status: WarningStatus.ACTIVE, expiresAt: new Date(NaN) },
        instant(),
      ),
    ).toThrow(BadRequestException);
  });
});
