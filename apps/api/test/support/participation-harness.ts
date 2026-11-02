import { types } from 'node:util';
import { AuditService } from '../../src/audit/audit.service';
import { AuthorizationService } from '../../src/authorization/authorization.service';
import { Prisma } from '../../src/generated/prisma/client';
import {
  AccountStatus,
  ClubRole,
  SystemRole,
  SessionStatus,
  SessionParticipantRole,
  SessionParticipantStatus,
  OneShotStatus,
  ApprovalStatus,
  FeedbackTargetType,
  FeedbackVisibility,
  CampaignStatus,
} from '../../src/generated/prisma/enums';
import { FeedbacksService } from '../../src/feedbacks/feedbacks.service';
import { FeedbacksQueryService } from '../../src/feedbacks/feedbacks-query.service';
import { FeedbacksManagementService } from '../../src/feedbacks/feedbacks-management.service';
import { ParticipationService } from '../../src/participation/participation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SessionsService } from '../../src/sessions/sessions.service';
import { OneShotsService } from '../../src/one-shots/one-shots.service';
import { TableActorsService } from '../../src/tables/table-actors.service';
import { TableRulesService } from '../../src/tables/table-rules.service';

type User = {
  id: string;
  status: AccountStatus;
  systemRole: SystemRole;
  authVersion: number;
  clubRoles: { role: ClubRole }[];
  profile: { displayName: string; whatsappNumber: string; birthDate: Date };
};
type Participant = {
  id: string;
  sessionId: string;
  userId: string;
  role: SessionParticipantRole;
  status: SessionParticipantStatus;
  registeredAt: Date;
  attendedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  attendanceCorrectionReason: string | null;
  updatedAt: Date;
};
type AuditRow = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  metadata: Record<string, unknown>;
};
type FeedbackRecord = {
  id: string;
  authorId: string;
  sessionId: string;
  targetType: FeedbackTargetType;
  targetUserId: string | null;
  targetKey: string;
  rating: number;
  comment: string | null;
  visibility: FeedbackVisibility;
  editableUntil: Date;
  createdAt: Date;
  updatedAt: Date;
  hiddenAt: Date | null;
  hiddenById: string | null;
  moderationReason: string | null;
};
type Selection = { readonly [key: string]: boolean | { select: Selection } };
function project(value: unknown, select?: Selection): unknown {
  if (!select || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => project(item, select));
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(select).map(([key, rule]) => [
      key,
      rule === true
        ? source[key]
        : rule === false
          ? undefined
          : project(source[key], rule.select),
    ]),
  );
}
const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Synthetic conflict', {
    code,
    clientVersion: '7.10.1',
  });

function matches(value: unknown, condition: unknown): boolean {
  if (types.isDate(condition))
    return types.isDate(value) && value.getTime() === condition.getTime();
  if (condition === null || typeof condition !== 'object')
    return value === condition;
  const source = (value ?? {}) as Record<string, unknown>;
  return Object.entries(condition).every(([key, rule]) => {
    if (key === 'gt')
      return types.isDate(value) && types.isDate(rule) && value > rule;
    if (key === 'OR')
      return (rule as unknown[]).some((item) => matches(value, item));
    if (key === 'AND')
      return (Array.isArray(rule) ? rule : [rule]).every((item) =>
        matches(value, item),
      );
    if (key === 'is') return value !== null && matches(value, rule);
    if (key === 'not') return !matches(value, rule);
    return matches(source[key], rule);
  });
}

// Repository double: clone per transaction, publish only on successful commit.
// This is not a substitute for testing isolation on a real database.
export function participationHarness(
  kind: 'campaign' | 'oneShot' = 'campaign',
  allowRootUserReads = false,
) {
  const users = Object.fromEntries(
    ['master', 'player', 'other', 'admin', 'club-admin'].map((id) => [
      id,
      {
        id,
        status: AccountStatus.APPROVED,
        systemRole: id === 'admin' ? SystemRole.ADMIN : SystemRole.USER,
        authVersion: 0,
        clubRoles:
          id === 'master'
            ? [{ role: ClubRole.MASTER }]
            : id === 'club-admin'
              ? [{ role: ClubRole.ADMIN }]
              : [],
        profile: {
          displayName: id,
          whatsappNumber: 'private-phone',
          birthDate: new Date('1990-01-01Z'),
        },
      } satisfies User,
    ]),
  );
  let state = {
    users: users as Record<string, User>,
    session: {
      id: 'session',
      campaignId: kind === 'campaign' ? 'campaign' : null,
      oneShotId: kind === 'oneShot' ? 'one-shot' : null,
      status: SessionStatus.SCHEDULED as SessionStatus,
      scheduledAt: new Date(Date.now() - 60_000),
      campaign: kind === 'campaign' ? { masterId: 'master' } : null,
      oneShot: kind === 'oneShot' ? { masterId: 'master' } : null,
      _count: { participants: 0, feedbacks: 0, reports: 0, sanctionScopes: 0 },
    },
    oneShotStatus: OneShotStatus.SCHEDULED as OneShotStatus,
    campaignStatus: CampaignStatus.ACTIVE as CampaignStatus,
    campaignApprovalStatus: ApprovalStatus.APPROVED as ApprovalStatus,
    oneShotApprovalStatus: ApprovalStatus.APPROVED as ApprovalStatus,
    participants: [] as Participant[],
    audits: [] as AuditRow[],
    feedbackCount: 0,
    feedbacks: [] as FeedbackRecord[],
  };
  let failAudit = false,
    failStatusWrite = false,
    abortOnce = false,
    failFeedbackWrite = false,
    failCommit = false;
  let afterAbort: (() => void) | undefined;
  let version = 0;
  const outside = jest.fn(() => {
    throw Error('Domain access outside transaction');
  });
  const clients: Array<ReturnType<typeof transactionClient>> = [];
  function transactionClient(draft: typeof state) {
    const feedbackRows = (where: unknown) =>
      draft.feedbacks.filter((row) =>
        matches(
          {
            ...row,
            session: {
              ...draft.session,
              campaign: draft.session.campaign
                ? {
                    ...draft.session.campaign,
                    status: draft.campaignStatus,
                    approvalStatus: draft.campaignApprovalStatus,
                  }
                : null,
              oneShot: draft.session.oneShot
                ? {
                    ...draft.session.oneShot,
                    status: draft.oneShotStatus,
                    approvalStatus: draft.oneShotApprovalStatus,
                  }
                : null,
            },
          },
          where,
        ),
      );
    const participantResult = (row: Participant, select?: Selection) =>
      project({ ...row, user: draft.users[row.userId] }, select);
    return {
      campaign: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: {
        findUnique: jest.fn(
          ({ where, select }: { where: { id: string }; select?: Selection }) =>
            Promise.resolve(project(draft.users[where.id] ?? null, select)),
        ),
      },
      session: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(where.id === draft.session.id ? draft.session : null),
        ),
        update: jest.fn(({ data }: { data: Partial<typeof state.session> }) => {
          if (failStatusWrite) throw Error('Synthetic status failure');
          Object.assign(draft.session, data);
          return Promise.resolve(draft.session);
        }),
      },
      oneShot: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'one-shot',
            masterId: 'master',
            status: draft.oneShotStatus,
            approvalStatus: ApprovalStatus.APPROVED,
            session: draft.session,
          }),
        ),
        update: jest.fn(({ data }: { data: { status: OneShotStatus } }) => {
          if (failStatusWrite) throw Error('Synthetic status failure');
          draft.oneShotStatus = data.status;
          return Promise.resolve({
            id: 'one-shot',
            status: draft.oneShotStatus,
            session: draft.session,
          });
        }),
      },
      sessionParticipant: {
        findMany: jest.fn(
          ({
            where,
            select,
            skip = 0,
            take,
          }: {
            where: { sessionId: string };
            select?: Selection;
            skip?: number;
            take?: number;
          }) => {
            const rows = draft.participants.filter(
              (p) => p.sessionId === where.sessionId,
            );
            return Promise.resolve(
              rows
                .slice(skip, take === undefined ? undefined : skip + take)
                .map((row) => participantResult(row, select)),
            );
          },
        ),
        findUnique: jest.fn(
          ({
            where,
            select,
          }: {
            where: { sessionId_userId: { sessionId: string; userId: string } };
            select?: Selection;
          }) => {
            const row = draft.participants.find(
              (p) =>
                p.sessionId === where.sessionId_userId.sessionId &&
                p.userId === where.sessionId_userId.userId,
            );
            return Promise.resolve(row ? participantResult(row, select) : null);
          },
        ),
        count: jest.fn(({ where }: { where: { sessionId: string } }) =>
          Promise.resolve(
            draft.participants.filter((p) => p.sessionId === where.sessionId)
              .length,
          ),
        ),
        create: jest.fn(
          ({
            data,
            select,
          }: {
            data: {
              sessionId: string;
              userId: string;
              role: SessionParticipantRole;
              status?: SessionParticipantStatus;
              attendedAt?: Date;
            };
            select?: Selection;
          }) => {
            if (
              draft.participants.some(
                (p) =>
                  p.sessionId === data.sessionId && p.userId === data.userId,
              )
            )
              throw prismaError('P2002');
            const row: Participant = {
              id: 'participant-' + draft.participants.length,
              registeredAt: new Date(),
              attendedAt: null,
              cancelledAt: null,
              cancellationReason: null,
              attendanceCorrectionReason: null,
              updatedAt: new Date(),
              status: SessionParticipantStatus.REGISTERED,
              ...data,
            };
            draft.participants.push(row);
            return Promise.resolve(participantResult(row, select));
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
            select,
          }: {
            where: { id: string };
            data: Partial<Participant>;
            select?: Selection;
          }) => {
            const row = draft.participants.find((p) => p.id === where.id);
            if (!row) throw prismaError('P2025');
            Object.assign(row, data, { updatedAt: new Date() });
            return Promise.resolve(participantResult(row, select));
          },
        ),
      },
      feedback: {
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: unknown;
            data: Partial<FeedbackRecord>;
          }) => {
            if (failFeedbackWrite)
              throw Error('Synthetic feedback write failure');
            const rows = feedbackRows(where);
            for (const row of rows)
              Object.assign(row, data, { updatedAt: new Date() });
            return Promise.resolve({ count: rows.length });
          },
        ),
        update: jest.fn(
          ({
            where,
            data,
            select,
          }: {
            where: { id: string };
            data: Partial<FeedbackRecord>;
            select?: Selection;
          }) => {
            if (failFeedbackWrite)
              throw Error('Synthetic feedback write failure');
            const row = draft.feedbacks.find((item) => item.id === where.id);
            if (!row) throw prismaError('P2025');
            Object.assign(row, data, { updatedAt: new Date() });
            return Promise.resolve(project(row, select));
          },
        ),
        count: jest.fn(({ where }: { where: unknown }) =>
          Promise.resolve(draft.feedbackCount + feedbackRows(where).length),
        ),
        findFirst: jest.fn(
          ({ where, select }: { where: unknown; select?: Selection }) =>
            Promise.resolve(project(feedbackRows(where)[0] ?? null, select)),
        ),
        findMany: jest.fn(
          ({
            where,
            select,
            skip = 0,
            take,
          }: {
            where: unknown;
            select?: Selection;
            skip?: number;
            take?: number;
          }) => {
            const rows = feedbackRows(where).sort(
              (a, b) =>
                b.createdAt.getTime() - a.createdAt.getTime() ||
                b.id.localeCompare(a.id),
            );
            return Promise.resolve(
              rows
                .slice(skip, take === undefined ? undefined : skip + take)
                .map((row) => project(row, select)),
            );
          },
        ),
        create: jest.fn(
          ({
            data,
            select,
          }: {
            data: Omit<
              FeedbackRecord,
              | 'id'
              | 'updatedAt'
              | 'hiddenAt'
              | 'hiddenById'
              | 'moderationReason'
            >;
            select?: Selection;
          }) => {
            if (failFeedbackWrite) throw Error('Synthetic feedback failure');
            if (
              draft.feedbacks.some(
                (row) =>
                  row.authorId === data.authorId &&
                  row.sessionId === data.sessionId &&
                  row.targetKey === data.targetKey,
              )
            ) {
              throw prismaError('P2002');
            }
            const row: FeedbackRecord = {
              id: 'feedback-' + draft.feedbacks.length,
              updatedAt: data.createdAt,
              hiddenAt: null,
              hiddenById: null,
              moderationReason: null,
              ...data,
            };
            draft.feedbacks.push(row);
            return Promise.resolve(project(row, select));
          },
        ),
      },
      auditLog: {
        create: jest.fn(({ data }: { data: AuditRow }) => {
          if (failAudit) throw Error('Synthetic audit failure');
          draft.audits.push(data);
          return Promise.resolve(data);
        }),
      },
    };
  }
  const transaction = jest.fn(
    async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const baseline = version;
      const draft = structuredClone(state);
      const tx = transactionClient(draft);
      clients.push(tx);
      const result = await operation(tx as unknown as Prisma.TransactionClient);
      if (failCommit) throw Error('Synthetic commit failure');
      if (abortOnce) {
        abortOnce = false;
        afterAbort?.();
        throw prismaError('P2034');
      }
      if (baseline !== version) throw prismaError('P2034');
      state = draft;
      version++;
      return result;
    },
  );
  const root = {
    $transaction: transaction,
    user: {
      findUnique: allowRootUserReads
        ? jest.fn((args: { where: { id: string }; select?: Selection }) =>
            Promise.resolve(
              project(state.users[args.where.id] ?? null, args.select),
            ),
          )
        : outside,
    },
    session: { findUnique: outside, update: outside },
    sessionParticipant: { findMany: outside, create: outside, update: outside },
    auditLog: { create: outside },
    feedback: {
      update: outside,
      updateMany: outside,
      create: outside,
      count: outside,
      findFirst: outside,
      findMany: outside,
    },
    campaign: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    onModuleInit: jest.fn(),
    onModuleDestroy: jest.fn(),
  };
  const prisma = root as unknown as PrismaService;
  const authorization = new AuthorizationService(prisma);
  const actors = new TableActorsService(prisma, authorization);
  const rules = new TableRulesService(prisma);
  const audit = new AuditService(prisma, authorization);
  const participation = new ParticipationService(prisma, actors, rules, audit);
  return {
    root,
    prisma,
    clients,
    transaction,
    outside,
    participation,
    feedbacks: new FeedbacksService(authorization, rules),
    feedbackQueries: new FeedbacksQueryService(prisma, authorization),
    feedbackManagement: new FeedbacksManagementService(
      authorization,
      rules,
      audit,
    ),
    sessions: new SessionsService(prisma, actors, rules, participation),
    oneShots: new OneShotsService(prisma, actors, rules, audit, participation),
    state: () => state,
    failAudit: () => {
      failAudit = true;
    },
    failStatusWrite: () => {
      failStatusWrite = true;
    },
    failFeedbackWrite: () => {
      failFeedbackWrite = true;
    },
    failCommit: () => {
      failCommit = true;
    },
    retryOnce: (callback?: () => void) => {
      abortOnce = true;
      afterAbort = callback;
    },
  };
}

export async function completedParticipationHarness(
  kind: 'campaign' | 'oneShot' = 'campaign',
  allowRootUserReads = false,
) {
  const h = participationHarness(kind, allowRootUserReads);
  for (const userId of ['player', 'other']) {
    await h.participation.add('session', 'master', userId);
    await h.participation.recordAttendance('session', userId, 'master', {
      status: SessionParticipantStatus.ATTENDED,
    });
  }
  if (kind === 'campaign')
    await h.sessions.changeStatus('session', 'master', {
      status: SessionStatus.COMPLETED,
    });
  else
    await h.oneShots.changeStatus('one-shot', 'master', {
      status: OneShotStatus.COMPLETED,
    });
  return h;
}
