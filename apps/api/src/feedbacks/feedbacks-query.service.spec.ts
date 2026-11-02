import {
  AccountStatus,
  ApprovalStatus,
  CampaignStatus,
  FeedbackTargetType,
  OneShotStatus,
  SessionStatus,
  SystemRole,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { feedbackQueryHarness } from '../../test/support/feedback-query-harness';
import { ListFeedbacksDto } from './feedback.dto';

describe('Feedback visibility and queries', () => {
  let h: Awaited<ReturnType<typeof feedbackQueryHarness>>;
  const query = () => new ListFeedbacksDto();
  beforeEach(async () => {
    h = await feedbackQueryHarness();
  });

  it('projects only visible public fields and counts only the public scope', async () => {
    const result = await h.feedbackQueries.listPublic('session', query());
    expect(result.meta).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
    expect(result.items.map((row) => row.id).sort()).toEqual(
      [h.ids.session, h.ids.publicPlayer].sort(),
    );
    for (const row of result.items)
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'targetType',
          'rating',
          'comment',
          'visibility',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(JSON.stringify(result)).not.toContain('Hidden content');
  });
  it.each(['player', 'master', 'other'])(
    'shows only authored or received records to %s',
    async (actor) => {
      const result = await h.feedbackQueries.listPersonal(
        'session',
        actor,
        query(),
      );
      const expected = h
        .state()
        .feedbacks.filter(
          (row) =>
            !row.hiddenAt &&
            (row.authorId === actor || row.targetUserId === actor),
        );
      expect(result.items.map((row) => row.id).sort()).toEqual(
        expected.map((row) => row.id).sort(),
      );
      expect(result.meta.total).toBe(expected.length);
      for (const row of result.items) {
        expect(row).not.toHaveProperty('moderationReason');
        expect(row).not.toHaveProperty('targetKey');
        expect(row).not.toHaveProperty('user');
      }
    },
  );
  it('does not expand the personal scope for an unrelated administrator', async () => {
    expect(
      (await h.feedbackQueries.listPersonal('session', 'admin', query())).meta
        .total,
    ).toBe(0);
  });
  it.each(['player', 'master'])(
    'lets author or recipient read private feedback: %s',
    async (actor) => {
      expect(
        await h.feedbackQueries.findPersonal(h.ids.privateMaster, actor),
      ).toMatchObject({ id: h.ids.privateMaster, comment: 'Private opinion' });
    },
  );
  it.each(['missing', 'unrelated', 'hidden'])(
    'uses the same 404 for inaccessible details: %s',
    async (key) => {
      const id =
        key === 'missing' ? 'missing' : h.ids[key as 'unrelated' | 'hidden'];
      await expect(
        h.feedbackQueries.findPersonal(id, 'player'),
      ).rejects.toMatchObject({ response: { code: 'FEEDBACK_NOT_FOUND' } });
    },
  );
  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'allows %s moderation reads including hidden history',
    async (role) => {
      h.state().users.admin.systemRole = role;
      const result = await h.feedbackQueries.listAdministrative(
        'session',
        'admin',
        query(),
      );
      expect(result.meta.total).toBe(5);
      expect(
        await h.feedbackQueries.findAdministrative(h.ids.hidden, 'admin'),
      ).toMatchObject({
        moderationReason: 'Private moderation reason',
        hiddenById: 'admin',
      });
      for (const row of result.items)
        expect(row).not.toHaveProperty('targetKey');
    },
  );
  it.each(['master', 'player', 'club-admin'])(
    'rejects administrative reads for %s',
    async (actor) => {
      await expect(
        h.feedbackQueries.listAdministrative('session', actor, query()),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        h.feedbackQueries.findAdministrative(h.ids.privateMaster, actor),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
  ])('rechecks account status in the read transaction: %s', async (status) => {
    h.state().users.player.status = status;
    await expect(
      h.feedbackQueries.listPersonal('session', 'player', query()),
    ).rejects.toMatchObject({ status: 403 });
    h.state().users.admin.status = status;
    await expect(
      h.feedbackQueries.listAdministrative('session', 'admin', query()),
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each([CampaignStatus.INACTIVE, CampaignStatus.ARCHIVED])(
    'hides public feedback for campaign %s while retaining personal history',
    async (status) => {
      h.state().campaignStatus = status;
      expect(
        (await h.feedbackQueries.listPublic('session', query())).meta.total,
      ).toBe(0);
      expect(
        (await h.feedbackQueries.listPersonal('session', 'player', query()))
          .meta.total,
      ).toBe(3);
    },
  );
  it.each([ApprovalStatus.PENDING, ApprovalStatus.REJECTED])(
    'hides unapproved campaign feedback: %s',
    async (status) => {
      h.state().campaignApprovalStatus = status;
      expect(
        (await h.feedbackQueries.listPublic('session', query())).items,
      ).toEqual([]);
    },
  );
  it.each([SessionStatus.SCHEDULED, SessionStatus.CANCELLED])(
    'hides feedback for a non-completed session: %s',
    async (status) => {
      h.state().session.status = status;
      expect(
        (await h.feedbackQueries.listPublic('session', query())).meta.total,
      ).toBe(0);
    },
  );
  it('publishes approved completed one-shot feedback without reopening the table', async () => {
    h = await feedbackQueryHarness('oneShot');
    expect(
      (await h.feedbackQueries.listPublic('session', query())).meta.total,
    ).toBe(2);
    h.state().oneShotApprovalStatus = ApprovalStatus.REJECTED;
    expect(
      (await h.feedbackQueries.listPublic('session', query())).meta.total,
    ).toBe(0);
  });
  it.each([OneShotStatus.SCHEDULED, OneShotStatus.CANCELLED])(
    'hides one-shot feedback for parent state %s',
    async (status) => {
      h = await feedbackQueryHarness('oneShot');
      h.state().oneShotStatus = status;
      expect(
        (await h.feedbackQueries.listPublic('session', query())).meta.total,
      ).toBe(0);
    },
  );
  it('does not expose an invalid table relationship or an unknown session', async () => {
    h.state().session.oneShotId = 'invalid-extra-parent';
    expect(
      (await h.feedbackQueries.listPublic('session', query())).meta.total,
    ).toBe(0);
    expect(
      (await h.feedbackQueries.listPublic('unknown', query())).meta.total,
    ).toBe(0);
  });
  it('applies type filters to both rows and totals', async () => {
    expect(
      (
        await h.feedbackQueries.listPublic('session', {
          ...query(),
          targetType: FeedbackTargetType.MASTER,
        })
      ).meta.total,
    ).toBe(0);
    const result = await h.feedbackQueries.listPersonal('session', 'player', {
      ...query(),
      targetType: FeedbackTargetType.MASTER,
    });
    expect(result.items.map((row) => row.id)).toEqual([h.ids.privateMaster]);
    expect(result.meta.total).toBe(1);
  });
  it('paginates with deterministic createdAt/id ordering', async () => {
    for (const row of h.state().feedbacks)
      row.createdAt = new Date('2026-01-01Z');
    const first = await h.feedbackQueries.listPublic('session', {
      page: 1,
      limit: 1,
    });
    const second = await h.feedbackQueries.listPublic('session', {
      page: 2,
      limit: 1,
    });
    expect(first.items[0].id).toBe(h.ids.publicPlayer);
    expect(second.items[0].id).toBe(h.ids.session);
    expect(second.meta).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
  });
  it.each([
    { page: 0, limit: 20 },
    { page: 1, limit: 51 },
    { page: 1.5, limit: 20 },
    { page: Number.MAX_SAFE_INTEGER, limit: 50 },
  ])('rejects invalid service pagination %j', async (value) => {
    await expect(
      h.feedbackQueries.listPublic('session', value),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('keeps authorization, rows and total in one repeatable-read transaction without audit writes', async () => {
    const audits = h.state().audits.length;
    await h.feedbackQueries.listPersonal('session', 'player', query());
    const tx = h.clients.at(-1)!;
    expect(tx.user.findUnique).toHaveBeenCalled();
    expect(tx.feedback.findMany.mock.calls[0][0].where).toEqual(
      tx.feedback.count.mock.calls[0][0].where,
    );
    expect(h.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(h.outside).not.toHaveBeenCalled();
    expect(h.state().audits).toHaveLength(audits);
  });
});
