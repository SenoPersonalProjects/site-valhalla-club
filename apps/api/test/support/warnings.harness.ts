import { AuditService } from '../../src/audit/audit.service';
import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Prisma } from '../../src/generated/prisma/client';
import {
  AccountStatus,
  ClubRole,
  ReportStatus,
  ReportTargetType,
  SystemRole,
  WarningSeverity,
  WarningStatus,
} from '../../src/generated/prisma/enums';
import { PrismaService } from '../../src/prisma/prisma.service';
import { calculateWarning } from '../../src/warnings/warning-policy';
import { warningDetailSelect } from '../../src/warnings/warnings.select';
import { WarningsService } from '../../src/warnings/warnings.service';

type Row = Prisma.WarningGetPayload<{ select: typeof warningDetailSelect }>;
type Selection = { [key: string]: boolean | { select: Selection } };
type Where = {
  userId?: string;
  categoryId?: string;
  severity?: WarningSeverity;
  status?: WarningStatus;
  reportId?: string;
  expiresAt?: { gt?: Date; lte?: Date };
  OR?: Where[];
};
type Actor = {
  id: string;
  status: AccountStatus;
  systemRole: SystemRole;
  authVersion: number;
  clubRoles: { role: ClubRole }[];
};
type AuditData = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  metadata: unknown;
};
type State = { warnings: Row[]; audits: AuditData[] };
type Creation = ReturnType<typeof calculateWarning> & {
  userId: string;
  categoryId: string;
  createdById: string;
  reportId: string | null;
  status: WarningStatus;
  reason: string;
};

function project(source: object, select: Selection): Record<string, unknown> {
  const record = source as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, enabled]) => enabled)
      .map(([key, value]) => [
        key,
        typeof value === 'object'
          ? project(record[key] as object, value.select)
          : record[key],
      ]),
  );
}
function matches(row: Row, where: Where): boolean {
  return (
    (where.userId === undefined || row.userId === where.userId) &&
    (where.categoryId === undefined || row.categoryId === where.categoryId) &&
    (where.severity === undefined || row.severity === where.severity) &&
    (where.status === undefined || row.status === where.status) &&
    (where.reportId === undefined || row.reportId === where.reportId) &&
    (where.expiresAt?.gt === undefined || row.expiresAt > where.expiresAt.gt) &&
    (where.expiresAt?.lte === undefined ||
      row.expiresAt <= where.expiresAt.lte) &&
    (where.OR === undefined || where.OR.some((option) => matches(row, option)))
  );
}

export const warningSerializationConflict = () =>
  new Prisma.PrismaClientKnownRequestError('Synthetic private SQL', {
    code: 'P2034',
    clientVersion: '7',
  });

export function warningsHarness() {
  const users: Record<string, Actor> = Object.fromEntries(
    ['admin', 'dev', 'user', 'master', 'club-admin', 'target'].map((id) => [
      id,
      {
        id,
        status: AccountStatus.APPROVED,
        authVersion: 0,
        systemRole:
          id === 'admin'
            ? SystemRole.ADMIN
            : id === 'dev'
              ? SystemRole.DEV
              : SystemRole.USER,
        clubRoles:
          id === 'club-admin'
            ? [{ role: ClubRole.ADMIN }]
            : id === 'master'
              ? [{ role: ClubRole.MASTER }]
              : [],
      } satisfies Actor,
    ]),
  );
  const categories = [
    {
      id: 'respect',
      code: 'RESPECT',
      label: 'Ofensas e desrespeito',
      active: true,
    },
    { id: 'other', code: 'OTHER', label: 'Outros', active: true },
    { id: 'inactive', code: 'INACTIVE', label: 'Inativa', active: false },
  ];
  const reports = [
    {
      id: 'resolved-report',
      status: ReportStatus.RESOLVED,
      targetType: ReportTargetType.USER,
      reportedUserId: 'target' as string | null,
      categoryId: 'respect',
      description: 'Private report description',
      authorId: 'Private reporter',
      resolutionNote: 'Private resolution note',
      evidences: [{ url: 'https://private.example.test/evidence' }],
    },
  ];
  let state: State = { warnings: [], audits: [] };
  const control = {
    aborts: 0,
    adapterAborts: false,
    auditFails: false,
    writeFails: false,
    mutationError: undefined as Error | undefined,
    updateMiss: false,
    commitFails: false,
    afterAbort: undefined as (() => void) | undefined,
  };
  const outside = jest.fn(() => {
    throw new Error('Disciplinary access outside transaction');
  });

  function makeClient(draft: State) {
    const rows = (where: Where = {}) =>
      draft.warnings.filter((row) => matches(row, where));
    const total = (items: Row[]) => ({
      _count: { _all: items.length },
      _sum: {
        effectiveWeight: items.length
          ? items.reduce(
              (sum, row) => sum.add(row.effectiveWeight),
              new Prisma.Decimal(0),
            )
          : null,
      },
    });
    return {
      user: {
        findUnique: jest.fn(
          ({ where }: { where: { id: string }; select?: object }) =>
            Promise.resolve(users[where.id] ?? null),
        ),
      },
      campaign: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      report: {
        findUnique: jest.fn(
          ({ where, select }: { where: { id: string }; select: Selection }) => {
            const report = reports.find((row) => row.id === where.id);
            return Promise.resolve(report ? project(report, select) : null);
          },
        ),
      },
      disciplinaryCategory: {
        findUnique: jest.fn(
          ({ where }: { where: { id: string }; select: object }) =>
            Promise.resolve(
              categories.find((row) => row.id === where.id) ?? null,
            ),
        ),
        findMany: jest.fn(
          ({
            where,
            select,
          }: {
            where: { id: { in: string[] } };
            select: Selection;
          }) =>
            Promise.resolve(
              categories
                .filter((row) => where.id.in.includes(row.id))
                .map((row) => project(row, select)),
            ),
        ),
      },
      warning: {
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: {
              id: string;
              status: WarningStatus;
              expiresAt?: { lte: Date };
            };
            data: {
              status: WarningStatus;
              reversedById?: string;
              reversedAt?: Date;
              reversalReason?: string;
            };
          }) => {
            if (control.writeFails)
              return Promise.reject(new Error('Synthetic mutation failure'));
            if (control.mutationError)
              return Promise.reject(control.mutationError);
            const row = draft.warnings.find(
              (item) => item.id === where.id && item.status === where.status,
            );
            if (
              !row ||
              (where.expiresAt !== undefined &&
                row.expiresAt > where.expiresAt.lte) ||
              control.updateMiss
            )
              return Promise.resolve({ count: 0 });
            Object.assign(row, data, { updatedAt: new Date() });
            return Promise.resolve({ count: 1 });
          },
        ),
        count: jest.fn(({ where }: { where: Where }) =>
          Promise.resolve(rows(where).length),
        ),
        create: jest.fn(
          ({ data, select }: { data: Creation; select: Selection }) => {
            if (control.writeFails)
              return Promise.reject(new Error('Synthetic mutation failure'));
            if (control.mutationError)
              return Promise.reject(control.mutationError);
            if (
              data.reportId !== null &&
              draft.warnings.some((row) => row.reportId === data.reportId)
            )
              return Promise.reject(
                new Prisma.PrismaClientKnownRequestError(
                  'Synthetic private unique constraint',
                  {
                    code: 'P2002',
                    clientVersion: '7',
                    meta: { modelName: 'Warning', target: ['reportId'] },
                  },
                ),
              );
            const category = categories.find(
              (row) => row.id === data.categoryId,
            )!;
            const row: Row = {
              ...data,
              id: 'warning-' + draft.warnings.length,
              category: {
                id: category.id,
                code: category.code,
                label: category.label,
              },
              reversedById: null,
              reversedAt: null,
              reversalReason: null,
              updatedAt: new Date(),
            };
            draft.warnings.push(row);
            return Promise.resolve(project(row, select));
          },
        ),
        findUnique: jest.fn(
          ({
            where,
            select,
          }: {
            where: { id?: string; reportId?: string };
            select: Selection;
          }) => {
            const row = draft.warnings.find((item) =>
              where.reportId !== undefined
                ? item.reportId === where.reportId
                : item.id === where.id,
            );
            return Promise.resolve(row ? project(row, select) : null);
          },
        ),
        findMany: jest.fn(
          ({
            where,
            select,
            skip = 0,
            take,
            orderBy,
          }: {
            where: Where;
            select: Selection;
            skip?: number;
            take?: number;
            orderBy: Array<{
              createdAt?: string;
              expiresAt?: string;
              id?: string;
            }>;
          }) =>
            Promise.resolve(
              rows(where)
                .sort((a, b) =>
                  orderBy[0]?.expiresAt === 'asc'
                    ? a.expiresAt.getTime() - b.expiresAt.getTime() ||
                      a.id.localeCompare(b.id)
                    : b.createdAt.getTime() - a.createdAt.getTime() ||
                      b.id.localeCompare(a.id),
                )
                .slice(skip, take === undefined ? undefined : skip + take)
                .map((row) => project(row, select)),
            ),
        ),
        aggregate: jest.fn(
          ({ where }: { where: Where; _count: object; _sum: object }) =>
            Promise.resolve(total(rows(where))),
        ),
        groupBy: jest.fn(
          ({
            where,
          }: {
            where: Where;
            by: string[];
            _count: object;
            _sum: object;
            orderBy: object;
          }) => {
            const items = rows(where);
            return Promise.resolve(
              [...new Set(items.map((row) => row.categoryId))].map(
                (categoryId) => ({
                  categoryId,
                  ...total(
                    items.filter((row) => row.categoryId === categoryId),
                  ),
                }),
              ),
            );
          },
        ),
      },
      auditLog: {
        create: jest.fn(({ data }: { data: AuditData }) => {
          if (control.auditFails)
            return Promise.reject(new Error('Synthetic audit failure'));
          draft.audits.push({ ...data });
          return Promise.resolve(data);
        }),
      },
    };
  }
  const clients: ReturnType<typeof makeClient>[] = [];
  const transaction = jest.fn(
    async (
      operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options?: {
        isolationLevel?: Prisma.TransactionIsolationLevel;
        timeout?: number;
      },
    ) => {
      if (!options?.isolationLevel)
        throw new Error('Missing transaction isolation');
      // Decimal instances are immutable values; structuredClone would erase their prototype.
      const draft: State = {
        warnings: state.warnings.map((row) => ({ ...row })),
        audits: [...state.audits],
      };
      const client = makeClient(draft);
      clients.push(client);
      const result = await operation(
        client as unknown as Prisma.TransactionClient,
      );
      if (control.aborts > 0) {
        control.aborts--;
        control.afterAbort?.();
        if (control.adapterAborts) {
          const error = new Error('Synthetic private adapter message', {
            cause: { kind: 'TransactionWriteConflict' },
          });
          error.name = 'DriverAdapterError';
          throw error;
        }
        throw warningSerializationConflict();
      }
      if (control.commitFails) throw new Error('Synthetic commit failure');
      state = draft;
      return result;
    },
  );
  const root = {
    $transaction: transaction,
    user: makeClient(state).user,
    warning: {
      updateMany: outside,
      create: outside,
      findMany: outside,
      findUnique: outside,
      count: outside,
      aggregate: outside,
      groupBy: outside,
    },
    disciplinaryCategory: { findMany: outside, findUnique: outside },
    auditLog: { create: outside },
    report: { findUnique: outside },
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };
  const prisma = root as unknown as PrismaService;
  const authorization = new AuthorizationService(prisma);
  const audit = new AuditService(prisma, authorization);
  const service = new WarningsService(prisma, authorization, audit);
  return {
    root,
    users,
    categories,
    reports,
    control,
    clients,
    transaction,
    outside,
    service,
    state: () => state,
    fixture: (extra: Partial<Row> = {}) => {
      const row: Row = {
        id: 'warning-' + state.warnings.length,
        userId: 'target',
        categoryId: 'respect',
        category: {
          id: 'respect',
          code: 'RESPECT',
          label: 'Ofensas e desrespeito',
        },
        ...calculateWarning(WarningSeverity.MODERATE, 0, new Date()),
        status: WarningStatus.ACTIVE,
        createdById: 'admin',
        reason: 'Private administrative reason',
        reportId: null,
        reversedById: null,
        reversedAt: null,
        reversalReason: null,
        updatedAt: new Date(),
        ...extra,
      };
      state.warnings.push(row);
      return row;
    },
  };
}
