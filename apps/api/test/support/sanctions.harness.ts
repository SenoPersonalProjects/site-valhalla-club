import { AuditService } from '../../src/audit/audit.service';
import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Prisma } from '../../src/generated/prisma/client';
import {
  AccountStatus,
  ClubRole,
  SanctionStatus,
  SanctionType,
  SystemRole,
} from '../../src/generated/prisma/enums';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SanctionsService } from '../../src/sanctions/sanctions.service';
import { AppealsService } from '../../src/appeals/appeals.service';

type User = {
  id: string;
  email: string;
  passwordHash: string | null;
  status: AccountStatus;
  systemRole: SystemRole;
  authVersion: number;
  clubRoles: { role: ClubRole }[];
};
type Sanction = Prisma.SanctionGetPayload<object>;
type Log = Prisma.AuditLogGetPayload<object>;
type Appeal = Prisma.AppealGetPayload<object>;
type State = { sanctions: Sanction[]; logs: Log[]; appeals: Appeal[] };
type Scope = { id: string };
type Report = {
  id: string;
  status: string;
  targetType: string;
  reportedUserId: string | null;
  description: string;
};
type Warning = {
  id: string;
  userId: string;
  reportId: string | null;
  status: string;
  expiresAt: Date;
  createdById: string;
  categoryId: string;
  severity: string;
  baseWeight: string;
  recurrenceMultiplier: string;
  effectiveWeight: string;
  occurrenceNumber: number;
  reason: string;
  reversedById: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
const date = (value: unknown): value is Date =>
  Object.prototype.toString.call(value) === '[object Date]';

function matches(row: object, where: object = {}): boolean {
  const fields = row as Record<string, unknown>;
  return Object.entries(where).every(([key, expected]: [string, unknown]) => {
    if (key === 'OR')
      return (
        Array.isArray(expected) &&
        expected.some((part: unknown) => record(part) && matches(row, part))
      );
    if (key === 'AND')
      return (
        Array.isArray(expected) &&
        expected.every((part: unknown) => record(part) && matches(row, part))
      );
    const actual = fields[key];
    if (date(expected))
      return date(actual) && actual.getTime() === expected.getTime();
    if (record(expected)) {
      return Object.entries(expected).every(([op, bound]) => {
        if (op === 'in') return Array.isArray(bound) && bound.includes(actual);
        if (!date(actual) || !date(bound)) return false;
        if (op === 'gt') return actual > bound;
        if (op === 'lte') return actual <= bound;
        return false;
      });
    }
    return actual === expected;
  });
}

function project<T extends object>(value: T | null, select?: object): T | null {
  if (!value || !select) return value;
  const fields = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(select).map((key) => [key, fields[key]]),
  ) as T;
}

export function sanctionsHarness(passwordHash: string | null = null) {
  const users = new Map<string, User>();
  for (const [id, systemRole] of [
    ['admin', SystemRole.ADMIN],
    ['dev', SystemRole.DEV],
    ['user', SystemRole.USER],
    ['club-admin', SystemRole.USER],
    ['target', SystemRole.USER],
  ] as const)
    users.set(id, {
      id,
      email: `${id}@example.test`,
      passwordHash,
      status: AccountStatus.APPROVED,
      systemRole,
      authVersion: 0,
      clubRoles: id === 'club-admin' ? [{ role: ClubRole.ADMIN }] : [],
    });
  const campaigns = new Map<string, Scope>([['campaign', { id: 'campaign' }]]);
  const sessions = new Map<string, Scope>([['session', { id: 'session' }]]);
  const reports = new Map<string, Report>([
    [
      'report',
      {
        id: 'report',
        status: 'RESOLVED',
        targetType: 'USER',
        reportedUserId: 'target',
        description: 'PRIVATE_REPORT_MARKER',
      },
    ],
  ]);
  const warnings = new Map<string, Warning>([
    [
      'warning',
      {
        id: 'warning',
        userId: 'target',
        reportId: 'report',
        status: 'ACTIVE',
        expiresAt: new Date('2035-01-01Z'),
        createdById: 'admin',
        categoryId: 'category',
        severity: 'MODERATE',
        baseWeight: '3',
        recurrenceMultiplier: '1.5',
        effectiveWeight: '4.5',
        occurrenceNumber: 2,
        reason: 'PRIVATE_WARNING_REASON',
        reversedById: null,
        reversedAt: null,
        reversalReason: null,
        createdAt: new Date('2026-01-01Z'),
        updatedAt: new Date('2026-01-01Z'),
      },
    ],
  ]);
  const initialWarnings = structuredClone(warnings);
  let state: State = { sanctions: [], logs: [], appeals: [] };
  let auditFails = false,
    commitFails = false,
    conflicts = 0;
  let afterConflict: (() => void) | undefined;
  let auditFailureAction: string | undefined;
  let conflictCode = 'P2034';
  const delegate = (snapshot: State, warningSnapshot = warnings) => ({
    user: {
      findUnique: jest.fn(({ where, select }: Prisma.UserFindUniqueArgs) =>
        Promise.resolve(
          project(
            [...users.values()].find((u) =>
              where.id ? u.id === where.id : u.email === where.email,
            ) ?? null,
            select ?? undefined,
          ),
        ),
      ),
    },
    campaign: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn(({ where }: Prisma.CampaignFindUniqueArgs) =>
        Promise.resolve(campaigns.get(where.id ?? '') ?? null),
      ),
    },
    session: {
      findUnique: jest.fn(({ where }: Prisma.SessionFindUniqueArgs) =>
        Promise.resolve(sessions.get(where.id ?? '') ?? null),
      ),
    },
    report: {
      findUnique: jest.fn(({ where, select }: Prisma.ReportFindUniqueArgs) =>
        Promise.resolve(
          project(reports.get(where.id ?? '') ?? null, select ?? undefined),
        ),
      ),
    },
    warning: {
      findUnique: jest.fn(({ where, select }: Prisma.WarningFindUniqueArgs) =>
        Promise.resolve(
          project(
            warningSnapshot.get(where.id ?? '') ?? null,
            select ?? undefined,
          ),
        ),
      ),
      findFirst: jest.fn(({ where, select }: Prisma.WarningFindFirstArgs) =>
        Promise.resolve(
          project(
            [...warningSnapshot.values()].find((row) => matches(row, where)) ??
              null,
            select ?? undefined,
          ),
        ),
      ),
      findMany: jest.fn(
        ({ where, select, skip = 0, take }: Prisma.WarningFindManyArgs) =>
          Promise.resolve(
            [...warningSnapshot.values()]
              .filter((row) => matches(row, where))
              .sort(
                (a, b) =>
                  b.createdAt.getTime() - a.createdAt.getTime() ||
                  b.id.localeCompare(a.id),
              )
              .slice(skip, take === undefined ? undefined : skip + take)
              .map((row) => project(row, select ?? undefined)),
          ),
      ),
      count: jest.fn(({ where }: Prisma.WarningCountArgs) =>
        Promise.resolve(
          [...warningSnapshot.values()].filter((row) => matches(row, where))
            .length,
        ),
      ),
      updateMany: jest.fn(({ where, data }: Prisma.WarningUpdateManyArgs) => {
        const rows = [...warningSnapshot.values()].filter((row) =>
          matches(row, where),
        );
        for (const row of rows)
          Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: rows.length });
      }),
    },
    appeal: {
      create: jest.fn(
        ({
          data,
          select,
        }: {
          data: Prisma.AppealUncheckedCreateInput;
          select?: object;
        }) => {
          const row = {
            id: `appeal-${snapshot.appeals.length}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            reviewedAt: null,
            reviewedById: null,
            response: null,
            ...data,
          } as Appeal;
          snapshot.appeals.push(row);
          return Promise.resolve(project(row, select));
        },
      ),
      findFirst: jest.fn(({ where, select }: Prisma.AppealFindFirstArgs) =>
        Promise.resolve(
          project(
            snapshot.appeals.find((row) => matches(row, where)) ?? null,
            select ?? undefined,
          ),
        ),
      ),
      findUnique: jest.fn(({ where, select }: Prisma.AppealFindUniqueArgs) =>
        Promise.resolve(
          project(
            snapshot.appeals.find((row) => row.id === where.id) ?? null,
            select ?? undefined,
          ),
        ),
      ),
      findUniqueOrThrow: jest.fn(
        ({ where, select }: Prisma.AppealFindUniqueOrThrowArgs) => {
          const row = snapshot.appeals.find((row) => row.id === where.id);
          if (!row) throw new Error('missing fixture');
          return Promise.resolve(project(row, select ?? undefined));
        },
      ),
      findMany: jest.fn(
        ({
          where,
          select,
          skip = 0,
          take,
          orderBy,
        }: Prisma.AppealFindManyArgs) =>
          Promise.resolve(
            snapshot.appeals
              .filter((row) => matches(row, where))
              .sort((a, b) =>
                !Array.isArray(orderBy) && orderBy?.sequence === 'desc'
                  ? b.sequence - a.sequence
                  : b.createdAt.getTime() - a.createdAt.getTime() ||
                    b.id.localeCompare(a.id),
              )
              .slice(skip, take === undefined ? undefined : skip + take)
              .map((row) => project(row, select ?? undefined)),
          ),
      ),
      count: jest.fn(({ where }: Prisma.AppealCountArgs) =>
        Promise.resolve(
          snapshot.appeals.filter((row) => matches(row, where)).length,
        ),
      ),
      updateMany: jest.fn(({ where, data }: Prisma.AppealUpdateManyArgs) => {
        const rows = snapshot.appeals.filter((row) => matches(row, where));
        for (const row of rows)
          Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: rows.length });
      }),
    },
    sanction: {
      create: jest.fn(
        ({
          data,
          select,
        }: {
          data: Prisma.SanctionUncheckedCreateInput;
          select?: object;
        }) => {
          const row = {
            id: `sanction-${snapshot.sanctions.length}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            reversedById: null,
            reversedAt: null,
            reversalReason: null,
            ...data,
          } as Sanction;
          snapshot.sanctions.push(row);
          return Promise.resolve(project(row, select));
        },
      ),
      findFirst: jest.fn(({ where, select }: Prisma.SanctionFindFirstArgs) =>
        Promise.resolve(
          project(
            snapshot.sanctions.find((s) => matches(s, where)) ?? null,
            select ?? undefined,
          ),
        ),
      ),
      findUnique: jest.fn(({ where, select }: Prisma.SanctionFindUniqueArgs) =>
        Promise.resolve(
          project(
            snapshot.sanctions.find((s) => s.id === where.id) ?? null,
            select ?? undefined,
          ),
        ),
      ),
      findUniqueOrThrow: jest.fn(
        ({ where, select }: Prisma.SanctionFindUniqueOrThrowArgs) => {
          const row = snapshot.sanctions.find((s) => s.id === where.id);
          if (!row) throw new Error('missing fixture');
          return Promise.resolve(project(row, select ?? undefined));
        },
      ),
      updateMany: jest.fn(({ where, data }: Prisma.SanctionUpdateManyArgs) => {
        const rows = snapshot.sanctions.filter((s) => matches(s, where));
        for (const row of rows)
          Object.assign(row, data, { updatedAt: new Date() });
        return Promise.resolve({ count: rows.length });
      }),
      findMany: jest.fn(
        ({
          where,
          select,
          skip = 0,
          take,
          orderBy,
        }: Prisma.SanctionFindManyArgs) =>
          Promise.resolve(
            snapshot.sanctions
              .filter((s) => matches(s, where))
              .sort((a, b) =>
                !Array.isArray(orderBy) && orderBy?.id === 'asc'
                  ? a.id.localeCompare(b.id)
                  : b.createdAt.getTime() - a.createdAt.getTime() ||
                    b.id.localeCompare(a.id),
              )
              .slice(skip, take === undefined ? undefined : skip + take)
              .map((s) => project(s, select ?? undefined)),
          ),
      ),
      count: jest.fn(({ where }: Prisma.SanctionCountArgs) =>
        Promise.resolve(
          snapshot.sanctions.filter((s) => matches(s, where)).length,
        ),
      ),
    },
    auditLog: {
      create: jest.fn(
        ({ data }: { data: Prisma.AuditLogUncheckedCreateInput }) => {
          if (
            auditFails &&
            (auditFailureAction === undefined ||
              auditFailureAction === data.action)
          )
            throw new Error('private audit failure');
          const row = {
            id: `log-${snapshot.logs.length}`,
            createdAt: new Date(),
            ...data,
          } as Log;
          snapshot.logs.push(row);
          return Promise.resolve(row);
        },
      ),
    },
  });
  const transactions: ReturnType<typeof delegate>[] = [];
  const root = {
    sanction: {
      findFirst: jest.fn((args: Prisma.SanctionFindFirstArgs) =>
        delegate(state).sanction.findFirst(args),
      ),
    },
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
    user: {
      findUnique: jest.fn((args: Prisma.UserFindUniqueArgs) =>
        delegate(state).user.findUnique(args),
      ),
      updateMany: jest.fn(({ where, data }: Prisma.UserUpdateManyArgs) => {
        const user =
          typeof where?.id === 'string' ? users.get(where.id) : undefined;
        if (
          !user ||
          (typeof where?.status === 'string' && user.status !== where.status)
        )
          return Promise.resolve({ count: 0 });
        if (
          typeof data.authVersion === 'object' &&
          typeof data.authVersion.increment === 'number'
        )
          user.authVersion += data.authVersion.increment;
        return Promise.resolve({ count: 1 });
      }),
    },
    $transaction: jest.fn(
      async <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => {
        const next = structuredClone(state);
        const nextWarnings = structuredClone(warnings);
        const tx = delegate(next, nextWarnings);
        transactions.push(tx);
        const result = await operation(
          tx as unknown as Prisma.TransactionClient,
        );
        if (conflicts > 0) {
          conflicts--;
          afterConflict?.();
          throw new Prisma.PrismaClientKnownRequestError('private conflict', {
            code: conflictCode,
            clientVersion: '7',
          });
        }
        if (commitFails) throw new Error('private commit failure');
        state = next;
        warnings.clear();
        for (const [id, row] of nextWarnings) warnings.set(id, row);
        return result;
      },
    ),
  };
  const prisma = root as unknown as PrismaService;
  const authorization = new AuthorizationService(prisma);
  const audit = new AuditService(prisma, authorization);
  const sanctions = new SanctionsService(prisma, authorization, audit);
  return {
    prisma,
    root,
    users,
    campaigns,
    sessions,
    reports,
    warnings,
    transactions,
    service: sanctions,
    appealsService: new AppealsService(prisma, authorization, audit, sanctions),
    appeals: () => structuredClone(state.appeals),
    state: () =>
      structuredClone({ sanctions: state.sanctions, logs: state.logs }),
    reset: () => {
      state = { sanctions: [], logs: [], appeals: [] };
      auditFails = false;
      commitFails = false;
      conflicts = 0;
      afterConflict = undefined;
      auditFailureAction = undefined;
      conflictCode = 'P2034';
      transactions.length = 0;
      for (const user of users.values()) {
        user.status = AccountStatus.APPROVED;
        user.systemRole =
          user.id === 'admin'
            ? SystemRole.ADMIN
            : user.id === 'dev'
              ? SystemRole.DEV
              : SystemRole.USER;
        user.authVersion = 0;
      }
      const report = reports.get('report')!;
      Object.assign(report, {
        status: 'RESOLVED',
        targetType: 'USER',
        reportedUserId: 'target',
      });
      warnings.clear();
      for (const [id, row] of structuredClone(initialWarnings))
        warnings.set(id, row);
    },
    fixture: (extra: Partial<Sanction> = {}) => {
      const row: Sanction = {
        id: `fixture-${state.sanctions.length}`,
        userId: 'target',
        reportId: null,
        warningId: null,
        type: SanctionType.TABLE_CREATION_RESTRICTION,
        status: SanctionStatus.ACTIVE,
        scopeType: 'GENERAL',
        campaignId: null,
        sessionId: null,
        scopeDescription: null,
        reason: 'PRIVATE_REASON_MARKER',
        startsAt: new Date('2026-01-01Z'),
        endsAt: new Date('2035-01-01Z'),
        createdById: 'admin',
        reversedById: null,
        reversedAt: null,
        reversalReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extra,
      };
      state.sanctions.push(row);
      return row;
    },
    appealFixture: (extra: Partial<Appeal> = {}) => {
      const row: Appeal = {
        id: `appeal-${state.appeals.length}`,
        userId: 'target',
        warningId: 'warning',
        sanctionId: null,
        sequence: 1,
        justification: 'PRIVATE_JUSTIFICATION',
        status: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        response: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extra,
      };
      state.appeals.push(row);
      return row;
    },
    failAudit: (action?: string) => {
      auditFails = true;
      auditFailureAction = action;
    },
    failCommit: () => {
      commitFails = true;
    },
    abort: (count: number, callback?: () => void) => {
      conflicts = count;
      conflictCode = 'P2034';
      afterConflict = callback;
    },
    abortUnique: (count: number, callback?: () => void) => {
      conflicts = count;
      conflictCode = 'P2002';
      afterConflict = callback;
    },
  };
}
