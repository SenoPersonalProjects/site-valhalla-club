import { completedParticipationHarness } from '../../test/support/participation-harness';
import {
  AccountStatus,
  FeedbackTargetType,
  FeedbackVisibility,
  SessionParticipantStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import {
  FEEDBACK_COMMENT_MAX_LENGTH,
  FEEDBACK_EDIT_WINDOW_MS,
} from './feedback.constants';
import { CreateFeedbackDto } from './feedback.dto';

const sessionFeedback: CreateFeedbackDto = {
  targetType: FeedbackTargetType.SESSION,
  rating: 8,
};
const masterFeedback: CreateFeedbackDto = {
  targetType: FeedbackTargetType.MASTER,
  targetUserId: 'master',
  rating: 8,
};
const playerFeedback: CreateFeedbackDto = {
  targetType: FeedbackTargetType.PLAYER,
  targetUserId: 'other',
  rating: 8,
};

describe('Feedback creation', () => {
  it.each([
    { ...sessionFeedback, comment: 'invalid\u0000comment' },
    { ...masterFeedback, targetUserId: 'invalid\u0000id' },
  ])('rejects NUL input before reaching the database: %j', async (dto) => {
    const h = await completedParticipationHarness();
    await expect(
      h.feedbacks.create('session', 'player', dto),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.state().feedbacks).toEqual([]);
  });
  it.each([
    [sessionFeedback, 'SESSION'],
    [masterFeedback, 'MASTER:master'],
    [playerFeedback, 'PLAYER:other'],
  ] as const)(
    'creates %j using a canonical server-side target key',
    async (dto, key) => {
      const h = await completedParticipationHarness();
      const auditCount = h.state().audits.length;
      const result = await h.feedbacks.create('session', 'player', dto);
      expect(result).toMatchObject({
        authorId: 'player',
        sessionId: 'session',
        targetType: dto.targetType,
        rating: 8,
        comment: null,
        visibility: 'PUBLIC',
      });
      expect(h.state().feedbacks[0].targetKey).toBe(key);
      expect(result).not.toHaveProperty('targetKey');
      expect(result).not.toHaveProperty('hiddenById');
      expect(result).not.toHaveProperty('moderationReason');
      expect(result).not.toHaveProperty('user');
      expect(h.state().audits).toHaveLength(auditCount);
      expect(h.state().users.player.clubRoles).toEqual([]);
      expect(h.outside).not.toHaveBeenCalled();
    },
  );

  it.each([0, 5, 10])(
    'accepts integer rating %s and anchors the edit deadline to persisted creation',
    async (rating) => {
      const h = await completedParticipationHarness();
      const result = await h.feedbacks.create('session', 'player', {
        ...masterFeedback,
        rating,
      });
      expect(result.rating).toBe(rating);
      expect(result.editableUntil.getTime() - result.createdAt.getTime()).toBe(
        FEEDBACK_EDIT_WINDOW_MS,
      );
    },
  );

  it.each([masterFeedback, playerFeedback])(
    'creates private individual feedback %j for the author',
    async (dto) => {
      const h = await completedParticipationHarness();
      const result = await h.feedbacks.create('session', 'player', {
        ...dto,
        comment: '  Private feedback  ',
        visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
      });
      expect(result).toMatchObject({
        visibility: 'PRIVATE_TO_RECIPIENT',
        comment: 'Private feedback',
      });
    },
  );

  it('supports one-shot feedback under the same participation rules', async () => {
    const h = await completedParticipationHarness('oneShot');
    const result = await h.feedbacks.create(
      'session',
      'player',
      masterFeedback,
    );
    expect(result.targetType).toBe('MASTER');
    expect(h.state().feedbacks).toHaveLength(1);
  });

  it.each([undefined, null, '', '   '])(
    'normalizes optional comment %s to null',
    async (comment) => {
      const h = await completedParticipationHarness();
      expect(
        (
          await h.feedbacks.create('session', 'player', {
            ...sessionFeedback,
            comment,
          })
        ).comment,
      ).toBeNull();
    },
  );

  it('handles the comment length boundary consistently for Unicode text', async () => {
    const h = await completedParticipationHarness();
    const comment = '🎲'.repeat(FEEDBACK_COMMENT_MAX_LENGTH);
    expect(
      (
        await h.feedbacks.create('session', 'player', {
          ...sessionFeedback,
          comment,
        })
      ).comment,
    ).toBe(comment);
    await expect(
      h.feedbacks.create('session', 'other', {
        ...sessionFeedback,
        comment: comment + '🎲',
      }),
    ).rejects.toMatchObject({ response: { code: 'FEEDBACK_COMMENT_INVALID' } });
  });

  it.each([
    [{ ...sessionFeedback, rating: -1 }, 'FEEDBACK_RATING_INVALID'],
    [{ ...sessionFeedback, rating: 11 }, 'FEEDBACK_RATING_INVALID'],
    [{ ...sessionFeedback, rating: 1.5 }, 'FEEDBACK_RATING_INVALID'],
    [{ ...sessionFeedback, rating: NaN }, 'FEEDBACK_RATING_INVALID'],
    [{ ...sessionFeedback, rating: Infinity }, 'FEEDBACK_RATING_INVALID'],
    [{ ...sessionFeedback, targetUserId: 'master' }, 'FEEDBACK_TARGET_INVALID'],
    [
      {
        ...sessionFeedback,
        visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
      },
      'FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED',
    ],
    [
      { ...masterFeedback, targetUserId: undefined },
      'FEEDBACK_TARGET_USER_REQUIRED',
    ],
    [
      { ...playerFeedback, targetUserId: null },
      'FEEDBACK_TARGET_USER_REQUIRED',
    ],
    [
      { ...masterFeedback, targetUserId: '   ' },
      'FEEDBACK_TARGET_USER_REQUIRED',
    ],
    [
      { ...masterFeedback, targetUserId: 'x'.repeat(129) },
      'FEEDBACK_TARGET_INVALID',
    ],
  ] as const)('rejects invalid domain input %j', async (dto, code) => {
    const h = await completedParticipationHarness();
    await expect(
      h.feedbacks.create('session', 'player', dto),
    ).rejects.toMatchObject({ response: { code } });
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    { ...sessionFeedback, targetType: 'INVALID' },
    { ...sessionFeedback, visibility: null },
    { ...sessionFeedback, visibility: 'INVALID' },
    { ...sessionFeedback, comment: 123 },
  ])('validates types even for direct service calls %j', async (input) => {
    const h = await completedParticipationHarness();
    await expect(
      h.feedbacks.create(
        'session',
        'player',
        input as unknown as CreateFeedbackDto,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    ['player', { ...playerFeedback, targetUserId: 'player' }],
    ['master', masterFeedback],
  ] as const)('rejects personal self-review by %s', async (author, dto) => {
    const h = await completedParticipationHarness();
    await expect(
      h.feedbacks.create('session', author, dto),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_SELF_REVIEW_FORBIDDEN' },
    });
  });

  it.each([
    AccountStatus.PENDING,
    AccountStatus.REJECTED,
    AccountStatus.SUSPENDED,
    AccountStatus.DELETION_PENDING,
    AccountStatus.ANONYMIZED,
  ])('denies direct creation by account in status %s', async (status) => {
    const h = await completedParticipationHarness();
    h.state().users.player.status = status;
    await expect(
      h.feedbacks.create('session', 'player', masterFeedback),
    ).rejects.toMatchObject({ response: { code: 'ACCOUNT_NOT_APPROVED' } });
    expect(h.state().feedbacks).toEqual([]);
  });

  it.each([
    SessionParticipantStatus.REGISTERED,
    SessionParticipantStatus.CONFIRMED,
    SessionParticipantStatus.CANCELLED,
    SessionParticipantStatus.NO_SHOW,
  ])('denies author participation %s', async (status) => {
    const h = await completedParticipationHarness();
    h.state().participants.find((p) => p.userId === 'player')!.status = status;
    await expect(
      h.feedbacks.create('session', 'player', masterFeedback),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_AUTHOR_NOT_ATTENDED' },
    });
  });

  it('does not allow ADMIN to bypass participation and does not disclose session state first', async () => {
    const h = await completedParticipationHarness();
    h.state().session.status = SessionStatus.SCHEDULED;
    await expect(
      h.feedbacks.create('session', 'admin', sessionFeedback),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_AUTHOR_NOT_ATTENDED' },
    });
    await expect(
      h.feedbacks.create('session', 'missing', sessionFeedback),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_FOUND' } });
  });

  it.each([SessionStatus.SCHEDULED, SessionStatus.CANCELLED])(
    'rejects session status %s for an attended author',
    async (status) => {
      const h = await completedParticipationHarness();
      h.state().session.status = status;
      await expect(
        h.feedbacks.create('session', 'player', masterFeedback),
      ).rejects.toMatchObject({
        response: { code: 'FEEDBACK_SESSION_NOT_COMPLETED' },
      });
    },
  );

  it('rejects missing sessions or a session without exactly one table', async () => {
    const h = await completedParticipationHarness();
    await expect(
      h.feedbacks.create('missing', 'player', masterFeedback),
    ).rejects.toMatchObject({ response: { code: 'SESSION_NOT_FOUND' } });
    h.state().session.campaignId = null;
    await expect(
      h.feedbacks.create('session', 'player', masterFeedback),
    ).rejects.toMatchObject({ response: { code: 'SESSION_WITHOUT_TABLE' } });
  });

  it.each([
    SessionParticipantStatus.REGISTERED,
    SessionParticipantStatus.CONFIRMED,
    SessionParticipantStatus.CANCELLED,
    SessionParticipantStatus.NO_SHOW,
  ])('rejects recipient participation %s', async (status) => {
    const h = await completedParticipationHarness();
    h.state().participants.find((p) => p.userId === 'other')!.status = status;
    await expect(
      h.feedbacks.create('session', 'player', playerFeedback),
    ).rejects.toMatchObject({
      response: { code: 'FEEDBACK_RECIPIENT_NOT_ELIGIBLE' },
    });
  });

  it.each([
    { ...masterFeedback, targetUserId: 'other' },
    { ...playerFeedback, targetUserId: 'master' },
    { ...playerFeedback, targetUserId: 'missing' },
    { ...playerFeedback, targetUserId: 'admin' },
  ])(
    'requires a recipient with the right role in the same session: %j',
    async (dto) => {
      const h = await completedParticipationHarness();
      await expect(
        h.feedbacks.create('session', 'player', dto),
      ).rejects.toMatchObject({
        response: { code: 'FEEDBACK_RECIPIENT_NOT_ELIGIBLE' },
      });
    },
  );

  it.each([sessionFeedback, masterFeedback, playerFeedback])(
    'preserves the first feedback and deadline on duplicate %j, even if hidden',
    async (dto) => {
      const h = await completedParticipationHarness();
      await h.feedbacks.create('session', 'player', dto);
      h.state().feedbacks[0].hiddenAt = new Date();
      const before = structuredClone(h.state().feedbacks);
      await expect(
        h.feedbacks.create('session', 'player', {
          ...dto,
          rating: 0,
          comment: 'Replacement',
        }),
      ).rejects.toMatchObject({
        response: { code: 'FEEDBACK_ALREADY_EXISTS' },
      });
      expect(h.state().feedbacks).toEqual(before);
    },
  );

  it('does not make visibility part of uniqueness, but permits different authors and targets', async () => {
    const h = await completedParticipationHarness();
    await h.feedbacks.create('session', 'player', masterFeedback);
    await expect(
      h.feedbacks.create('session', 'player', {
        ...masterFeedback,
        visibility: FeedbackVisibility.PRIVATE_TO_RECIPIENT,
      }),
    ).rejects.toMatchObject({ response: { code: 'FEEDBACK_ALREADY_EXISTS' } });
    await h.feedbacks.create('session', 'other', masterFeedback);
    await h.feedbacks.create('session', 'player', playerFeedback);
    expect(h.state().feedbacks).toHaveLength(3);
  });

  it('commits just one of two simultaneous submissions to the same target', async () => {
    const h = await completedParticipationHarness();
    const results = await Promise.allSettled([
      h.feedbacks.create('session', 'player', masterFeedback),
      h.feedbacks.create('session', 'player', masterFeedback),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { response: { code: 'FEEDBACK_ALREADY_EXISTS' } },
    });
    expect(h.state().feedbacks).toHaveLength(1);
  });

  it.each(['account', 'presence'] as const)(
    'rechecks %s after serialization failure and leaves no partial feedback',
    async (change) => {
      const h = await completedParticipationHarness();
      h.retryOnce(() => {
        if (change === 'account')
          h.state().users.player.status = AccountStatus.SUSPENDED;
        else
          h.state().participants.find((p) => p.userId === 'player')!.status =
            SessionParticipantStatus.NO_SHOW;
      });
      await expect(
        h.feedbacks.create('session', 'player', masterFeedback),
      ).rejects.toMatchObject({
        response: {
          code:
            change === 'account'
              ? 'ACCOUNT_NOT_APPROVED'
              : 'FEEDBACK_AUTHOR_NOT_ATTENDED',
        },
      });
      expect(h.state().feedbacks).toEqual([]);
    },
  );

  it.each(['write', 'commit'] as const)(
    'does not persist partial feedback on %s failure',
    async (failure) => {
      const h = await completedParticipationHarness();
      const before = structuredClone(h.state());
      if (failure === 'write') h.failFeedbackWrite();
      else h.failCommit();
      await expect(
        h.feedbacks.create('session', 'player', masterFeedback),
      ).rejects.toThrow();
      expect(h.state()).toEqual(before);
    },
  );

  it('serializes feedback and correction so an absent recipient never receives a new evaluation', async () => {
    const h = await completedParticipationHarness();
    const results = await Promise.allSettled([
      h.feedbacks.create('session', 'player', playerFeedback),
      h.participation.recordAttendance('session', 'other', 'admin', {
        status: SessionParticipantStatus.NO_SHOW,
        reason: 'Synthetic correction',
      }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const recipient = h.state().participants.find((p) => p.userId === 'other');
    if (h.state().feedbacks.length) expect(recipient?.status).toBe('ATTENDED');
    else expect(recipient?.status).toBe('NO_SHOW');
  });
});
