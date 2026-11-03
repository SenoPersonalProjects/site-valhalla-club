import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Prisma } from '../../src/generated/prisma/client';
import {
  AccountStatus,
  ClubRole,
  SystemRole,
  WarningSeverity,
} from '../../src/generated/prisma/enums';
import { PrismaService } from '../../src/prisma/prisma.service';
import { INITIAL_DISCIPLINARY_CATEGORIES } from '../../src/warnings/disciplinary-categories.constants';
import { DisciplinaryCategoriesService } from '../../src/warnings/disciplinary-categories.service';

type Category = {
  id: string;
  code: string;
  label: string;
  active: boolean;
  defaultSeverity: WarningSeverity | null;
  createdAt: Date;
  updatedAt: Date;
};
type Selection = Readonly<Record<string, boolean>>;
type Actor = {
  id: string;
  status: AccountStatus;
  authVersion: number;
  systemRole: SystemRole;
  clubRoles: { role: ClubRole }[];
};
export function disciplinaryCategoriesHarness() {
  const categories: Category[] = INITIAL_DISCIPLINARY_CATEGORIES.map(
    (row, index) => ({
      ...row,
      id: 'category-' + index,
      active: row.code !== 'OTHER',
      defaultSeverity: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }),
  );
  const users: Record<string, Actor> = Object.fromEntries(
    ['admin', 'dev', 'user', 'master', 'club-admin'].map((id) => [
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
  const outside = jest.fn(() => {
    throw Error('Category access outside transaction');
  });
  const tx = {
    user: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users[where.id] ?? null),
      ),
    },
    campaign: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    warning: { findMany: jest.fn().mockResolvedValue([]) },
    disciplinaryCategory: {
      findMany: jest.fn(
        ({
          where,
          select,
          skip = 0,
          take,
        }: {
          where: { active: boolean };
          select: Selection;
          skip?: number;
          take?: number;
          orderBy: object[];
        }) => {
          const rows = categories
            .filter((row) => row.active === where.active)
            .sort(
              (a, b) =>
                a.code.localeCompare(b.code) || a.id.localeCompare(b.id),
            );
          return Promise.resolve(
            rows
              .slice(skip, take === undefined ? undefined : skip + take)
              .map((row) => {
                const source = row as unknown as Record<string, unknown>;
                return Object.fromEntries(
                  Object.entries(select)
                    .filter(([, enabled]) => enabled)
                    .map(([key]) => [key, source[key]]),
                );
              }),
          );
        },
      ),
      count: jest.fn(({ where }: { where: { active: boolean } }) =>
        Promise.resolve(
          categories.filter((row) => row.active === where.active).length,
        ),
      ),
      createMany: jest.fn(
        ({
          data,
        }: {
          data: Array<{
            code: string;
            label: string;
            active: boolean;
            defaultSeverity: null;
          }>;
          skipDuplicates: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            if (categories.some((existing) => existing.code === row.code))
              continue;
            categories.push({
              ...row,
              id: 'category-' + categories.length,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            count++;
          }
          return Promise.resolve({ count });
        },
      ),
    },
  };
  const transaction = jest.fn(
    (operation: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      operation(tx as unknown as Prisma.TransactionClient),
  );
  const root = {
    $transaction: transaction,
    user: { findUnique: tx.user.findUnique },
    disciplinaryCategory: {
      findMany: outside,
      count: outside,
      createMany: outside,
    },
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };
  const prisma = root as unknown as PrismaService;
  return {
    categories,
    users,
    tx,
    transaction,
    root,
    outside,
    catalogClient: tx as unknown as Pick<
      Prisma.TransactionClient,
      'disciplinaryCategory'
    >,
    service: new DisciplinaryCategoriesService(
      prisma,
      new AuthorizationService(prisma),
    ),
  };
}
