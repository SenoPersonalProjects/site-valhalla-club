import { Prisma } from '../generated/prisma/client';
import {
  isWarningReportUniqueConflict,
  isWarningWriteConflict,
} from './warnings.transaction';

describe('Warning write conflict classification', () => {
  it('recognizes Prisma serialization conflicts', () => {
    expect(
      isWarningWriteConflict(
        new Prisma.PrismaClientKnownRequestError('private SQL', {
          code: 'P2034',
          clientVersion: '7',
        }),
      ),
    ).toBe(true);
  });
  it('recognizes a structured adapter commit conflict without matching its message', () => {
    const error = new Error('arbitrary private message', {
      cause: { kind: 'TransactionWriteConflict' },
    });
    error.name = 'DriverAdapterError';
    expect(isWarningWriteConflict(error)).toBe(true);
  });
  it.each([
    null,
    { name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict' } },
    new Error('TransactionWriteConflict'),
    new Error('DriverAdapterError', {
      cause: { kind: 'TransactionWriteConflict' },
    }),
    Object.assign(
      new Error('private FK failure', {
        cause: { kind: 'ForeignKeyConstraintViolation' },
      }),
      { name: 'DriverAdapterError' },
    ),
    Object.assign(new Error('unknown error'), { name: 'DriverAdapterError' }),
    new Prisma.PrismaClientKnownRequestError('private SQL', {
      code: 'P2002',
      clientVersion: '7',
    }),
  ])('does not retry unrelated failure %#', (error) => {
    expect(isWarningWriteConflict(error)).toBe(false);
  });
});

describe('Warning report unique conflict classification', () => {
  const known = (meta: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('Private unique SQL', {
      code: 'P2002',
      clientVersion: '7',
      meta,
    });
  const adapter = (constraint: object, table = 'Warning') =>
    Object.assign(
      new Error('Private adapter detail', {
        cause: { kind: 'UniqueConstraintViolation', constraint, table },
      }),
      { name: 'DriverAdapterError' },
    );
  it.each([['reportId'], 'Warning_reportId_key'])(
    'recognizes report-only target %j',
    (target) => {
      expect(
        isWarningReportUniqueConflict(known({ modelName: 'Warning', target })),
      ).toBe(true);
    },
  );
  it.each([{ index: 'Warning_reportId_key' }, { fields: ['reportId'] }])(
    'recognizes structured adapter constraint %j',
    (constraint) => {
      expect(isWarningReportUniqueConflict(adapter(constraint))).toBe(true);
      expect(
        isWarningReportUniqueConflict(
          known({
            modelName: 'Warning',
            driverAdapterError: adapter(constraint),
          }),
        ),
      ).toBe(true);
    },
  );
  it.each([
    null,
    new Error('P2002 Warning_reportId_key'),
    known({ target: ['id'] }),
    known({ modelName: 'Report', target: ['reportId'] }),
    known({ target: ['reportId', 'id'] }),
    adapter({ index: 'Another_reportId_key' }),
    adapter({ fields: ['reportId'] }, 'AnotherModel'),
    {
      name: 'DriverAdapterError',
      cause: {
        kind: 'UniqueConstraintViolation',
        constraint: { fields: ['reportId'] },
      },
    },
    new Prisma.PrismaClientKnownRequestError('Private FK failure', {
      code: 'P2003',
      clientVersion: '7',
      meta: { target: ['reportId'] },
    }),
  ])('ignores unrelated or unstructured error %#', (error) => {
    expect(isWarningReportUniqueConflict(error)).toBe(false);
  });
});
