import { feedbackQueryHarness } from '../../test/support/feedback-query-harness';
import {
  AccountStatus,
  FeedbackVisibility,
  SystemRole,
} from '../generated/prisma/enums';
import {
  FEEDBACK_EDIT_WINDOW_MS,
  FEEDBACK_MODERATION_REASON_MAX_LENGTH,
} from './feedback.constants';
import { UpdateFeedbackDto } from './feedback.dto';

describe('Feedback editing and administrative hiding', () => {
  let h: Awaited<ReturnType<typeof feedbackQueryHarness>>;
  beforeEach(async () => {
    h = await feedbackQueryHarness();
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  const stored = (harness: typeof h, id: string) =>
    harness.state().feedbacks.find((row) => row.id === id)!;

  it('changes only author-editable fields without renewing the original deadline', async () => {
    const before = structuredClone(stored(h, h.ids.privateMaster));
    const auditCount = h.state().audits.length;
    const result = await h.feedbackManagement.update(before.id, 'player', {
      rating: 0,
      comment: ' Updated opinion ',
      visibility: FeedbackVisibility.PUBLIC,
    });
    expect(result).toMatchObject({
      rating: 0,
      comment: 'Updated opinion',
      visibility: FeedbackVisibility.PUBLIC,
      authorId: before.authorId,
      sessionId: before.sessionId,
      targetType: before.targetType,
      targetUserId: before.targetUserId,
      createdAt: before.createdAt,
      editableUntil: before.editableUntil,
    });
    expect(stored(h, before.id).targetKey).toBe(before.targetKey);
    expect(result).not.toHaveProperty('hiddenById');
    expect(h.state().audits).toHaveLength(auditCount);
  });
  it.each([null, '', '   '])(
    'lets the author clear the optional comment: %j',
    async (comment) => {
      expect(
        await h.feedbackManagement.update(h.ids.privateMaster, 'player', {
          comment,
        }),
      ).toMatchObject({
        comment: null,
        rating: 9,
        visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
      });
    },
  );
  it('lets the author change a personal feedback from public to private', async () => {
    await h.feedbackManagement.update(h.ids.publicPlayer, 'master', {
      visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
    });
    expect(
      (await h.feedbackQueries.listPublic('session', { page: 1, limit: 20 }))
        .meta.total,
    ).toBe(1);
    expect(
      await h.feedbackQueries.findPersonal(h.ids.publicPlayer, 'player'),
    ).toMatchObject({ visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT });
  });
  it('rejects a private session feedback without changing its data', async () => {
    const before = structuredClone(h.state().feedbacks);
    await expect(
      h.feedbackManagement.update(h.ids.session, 'player', {
        visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
      }),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED' },
    });
    expect(h.state().feedbacks).toEqual(before);
  });
  it.each(['master', 'other', 'admin'])(
    'does not let recipient or administration edit another author: %s',
    async (actor) => {
      await expect(
        h.feedbackManagement.update(h.ids.privateMaster, actor, { rating: 3 }),
      ).rejects.toMatchObject({ response: { code: 'FEEDBACK_NOT_FOUND' } });
    },
  );
  it.each(['hidden', 'missing'])(
    'rejects author editing of %s feedback',
    async (key) => {
      await expect(
        h.feedbackManagement.update(
          key === 'hidden' ? h.ids.hidden : 'missing',
          'other',
          { rating: 2 },
        ),
      ).rejects.toMatchObject({ response: { code: 'FEEDBACK_NOT_FOUND' } });
    },
  );
  it.each([-1, 11, 2.5, NaN])(
    'rejects invalid rating %s at the service boundary',
    async (rating) => {
      await expect(
        h.feedbackManagement.update(h.ids.privateMaster, 'player', { rating }),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it.each([
    {},
    { comment: undefined },
    { comment: '\u0000' },
    { comment: 'x'.repeat(2001) },
  ])('rejects invalid update %j', async (dto) => {
    await expect(
      h.feedbackManagement.update(h.ids.privateMaster, 'player', dto),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each([-1, 0, 1])(
    'enforces the exact deadline at offset %s ms',
    async (offset) => {
      const row = stored(h, h.ids.privateMaster);
      jest.useFakeTimers().setSystemTime(row.editableUntil.getTime() + offset);
      const operation = h.feedbackManagement.update(row.id, 'player', {
        rating: 7,
      });
      if (offset < 0)
        expect(await operation).toMatchObject({
          rating: 7,
          editableUntil: row.editableUntil,
        });
      else
        await expect(operation).rejects.toMatchObject({
          response: { code: 'FEEDBACK_EDIT_WINDOW_CLOSED' },
        });
    },
  );
  it('does not trust an accidentally extended persisted deadline', async () => {
    const row = stored(h, h.ids.privateMaster);
    jest
      .useFakeTimers()
      .setSystemTime(row.createdAt.getTime() + FEEDBACK_EDIT_WINDOW_MS);
    row.editableUntil = new Date(Date.now() + FEEDBACK_EDIT_WINDOW_MS);
    await expect(
      h.feedbackManagement.update(row.id, 'player', { rating: 1 }),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_EDIT_WINDOW_CLOSED' },
    });
  });
  it('does not permit another edit after the original window expires', async () => {
    const row = structuredClone(stored(h, h.ids.privateMaster));
    jest
      .useFakeTimers()
      .setSystemTime(row.createdAt.getTime() + FEEDBACK_EDIT_WINDOW_MS - 1);
    await h.feedbackManagement.update(row.id, 'player', { rating: 1 });
    jest.setSystemTime(row.editableUntil);
    await expect(
      h.feedbackManagement.update(row.id, 'player', { rating: 2 }),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_EDIT_WINDOW_CLOSED' },
    });
    expect(stored(h, row.id).rating).toBe(1);
  });
  it('reevaluates the deadline when retrying a serialization conflict', async () => {
    const row = structuredClone(stored(h, h.ids.privateMaster));
    jest.useFakeTimers().setSystemTime(row.editableUntil.getTime() - 1);
    h.retryOnce(() => {
      jest.setSystemTime(row.editableUntil);
    });
    await expect(
      h.feedbackManagement.update(row.id, 'player', { rating: 1 }),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_EDIT_WINDOW_CLOSED' },
    });
    expect(stored(h, row.id).rating).toBe(row.rating);
  });
  it.each([SystemRole.ADMIN, SystemRole.DEV])(
    'allows %s to hide with atomic audit and minimal metadata',
    async (role) => {
      h.state().users.admin.systemRole = role;
      const before = structuredClone(stored(h, h.ids.privateMaster));
      const result = await h.feedbackManagement.hide(
        before.id,
        'admin',
        { reason: ' Sensitive moderation reason ' },
        'hide-request-1',
      );
      expect(result).toMatchObject({
        hiddenById: 'admin',
        moderationReason: 'Sensitive moderation reason',
        rating: before.rating,
        comment: before.comment,
        visibility: before.visibility,
        editableUntil: before.editableUntil,
        createdAt: before.createdAt,
      });
      expect(result.hiddenAt).toBeInstanceOf(Date);
      expect(h.state().audits.at(-1)).toEqual({
        actorId: 'admin',
        action: 'FEEDBACK_HIDDEN',
        entityType: 'FEEDBACK',
        entityId: before.id,
        requestId: 'hide-request-1',
        metadata: { changed: true, sessionId: 'session' },
      });
      expect(h.outside).not.toHaveBeenCalled();
    },
  );
  it('preserves first moderation attribution and reason when hiding again', async () => {
    const before = structuredClone(stored(h, h.ids.hidden));
    h.state().users.master.systemRole = SystemRole.DEV;
    const result = await h.feedbackManagement.hide(before.id, 'master', {
      reason: 'New reason must not replace the old one',
    });
    expect(result).toMatchObject({
      hiddenAt: before.hiddenAt,
      hiddenById: before.hiddenById,
      moderationReason: before.moderationReason,
      updatedAt: before.updatedAt,
    });
    expect(h.state().audits.at(-1)?.metadata).toEqual({
      changed: false,
      sessionId: 'session',
    });
  });
  it('hides expired feedback without deleting history or allowing replacement', async () => {
    const row = stored(h, h.ids.session);
    row.createdAt = new Date(Date.now() - FEEDBACK_EDIT_WINDOW_MS - 1);
    row.editableUntil = new Date(Date.now() - 1);
    await h.feedbackManagement.hide(row.id, 'admin', { reason: 'Moderation' });
    expect(h.state().feedbacks).toHaveLength(5);
    expect(
      (await h.feedbackQueries.listPublic('session', { page: 1, limit: 20 }))
        .meta.total,
    ).toBe(1);
    await expect(
      h.feedbackQueries.findPersonal(row.id, 'player'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      h.feedbacks.create('session', 'player', {
        targetType: row.targetType,
        rating: 8,
      }),
    ).rejects.toMatchObject({ response: { code: 'FEEDBACK_ALREADY_EXISTS' } });
  });
  it.each(['player', 'master', 'club-admin'])(
    'denies moderation for %s',
    async (actor) => {
      await expect(
        h.feedbackManagement.hide(h.ids.session, actor, {
          reason: 'Moderation',
        }),
      ).rejects.toMatchObject({ status: 403 });
    },
  );
  it.each([
    '',
    '  ',
    '\u0000',
    'x'.repeat(FEEDBACK_MODERATION_REASON_MAX_LENGTH + 1),
  ])('rejects invalid moderation reason', async (reason) => {
    const before = structuredClone(h.state());
    await expect(
      h.feedbackManagement.hide(h.ids.session, 'admin', { reason }),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_MODERATION_REASON_REQUIRED' },
    });
    expect(h.state()).toEqual(before);
  });
  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
  ])('rechecks status for editing and hiding: %s', async (status) => {
    h.state().users.player.status = status;
    h.state().users.admin.status = status;
    await expect(
      h.feedbackManagement.update(h.ids.session, 'player', { rating: 1 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      h.feedbackManagement.hide(h.ids.session, 'admin', {
        reason: 'Moderation',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it.each(['failAudit', 'failFeedbackWrite', 'failCommit'] as const)(
    'rolls back hiding and audit on %s',
    async (fail) => {
      const before = structuredClone(h.state());
      h[fail]();
      await expect(
        h.feedbackManagement.hide(h.ids.session, 'admin', {
          reason: 'Moderation',
        }),
      ).rejects.toThrow();
      expect(h.state()).toEqual(before);
    },
  );
  it('rolls back an edit on commit failure', async () => {
    const before = structuredClone(h.state());
    h.failCommit();
    await expect(
      h.feedbackManagement.update(h.ids.session, 'player', { rating: 1 }),
    ).rejects.toThrow();
    expect(h.state()).toEqual(before);
  });
  it('rechecks administrative permissions on retry and leaves no audit on denial', async () => {
    const audits = h.state().audits.length;
    h.retryOnce(() => {
      h.state().users.admin.systemRole = SystemRole.USER;
    });
    await expect(
      h.feedbackManagement.hide(h.ids.session, 'admin', {
        reason: 'Moderation',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(stored(h, h.ids.session).hiddenAt).toBeNull();
    expect(h.state().audits).toHaveLength(audits);
  });
  it('serializes concurrent editing and hiding without resurrecting a hidden record', async () => {
    const results = await Promise.allSettled([
      h.feedbackManagement.update(h.ids.session, 'player', { rating: 1 }),
      h.feedbackManagement.hide(h.ids.session, 'admin', {
        reason: 'Moderation',
      }),
    ]);
    expect(results[1].status).toBe('fulfilled');
    expect(stored(h, h.ids.session).hiddenAt).toBeInstanceOf(Date);
    await expect(
      h.feedbackManagement.update(h.ids.session, 'player', { rating: 2 }),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      h.state().audits.filter((row) => row.action === 'FEEDBACK_HIDDEN'),
    ).toHaveLength(1);
  });
  it('writes a conditional deadline and authorship predicate in the transaction', async () => {
    await h.feedbackManagement.update(h.ids.session, 'player', {
      rating: 10,
    } satisfies UpdateFeedbackDto);
    const tx = h.clients.at(-1)!;
    expect(tx.feedback.updateMany.mock.calls[0][0].where).toMatchObject({
      id: h.ids.session,
      authorId: 'player',
      hiddenAt: null,
      editableUntil: { gt: expect.any(Date) as Date },
      createdAt: { gt: expect.any(Date) as Date },
    });
    expect(h.transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});
