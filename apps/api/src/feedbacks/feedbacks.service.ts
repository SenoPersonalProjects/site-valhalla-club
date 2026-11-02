import { Injectable } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service';
import { Prisma } from '../generated/prisma/client';
import {
  FeedbackTargetType,
  FeedbackVisibility,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionStatus,
} from '../generated/prisma/enums';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../tables/table-domain.errors';
import { TableRulesService } from '../tables/table-rules.service';
import {
  FEEDBACK_ACCOUNT_REQUIREMENT,
  FEEDBACK_EDIT_WINDOW_MS,
} from './feedback.constants';
import { CreateFeedbackDto } from './feedback.dto';
import {
  feedbackComment,
  feedbackRating,
  feedbackTarget,
  feedbackVisibility,
} from './feedback.rules';
import { createdFeedbackSelect } from './feedback.select';

@Injectable()
export class FeedbacksService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly rules: TableRulesService,
  ) {}

  async create(sessionId: string, authorId: string, dto: CreateFeedbackDto) {
    try {
      return await this.rules.serializable(async (tx) => {
        await this.authorization.assertRoles(
          authorId,
          FEEDBACK_ACCOUNT_REQUIREMENT,
          tx,
        );
        const target = feedbackTarget(dto.targetType, dto.targetUserId);
        const rating = feedbackRating(dto.rating);
        const comment = feedbackComment(dto.comment);
        const visibility = feedbackVisibility(dto.visibility);
        if (target.targetUserId === authorId) {
          throw forbidden(
            'FEEDBACK_SELF_REVIEW_FORBIDDEN',
            'Não é permitido avaliar a si mesmo',
          );
        }
        if (
          target.targetType === FeedbackTargetType.SESSION &&
          visibility === FeedbackVisibility.PRIVATE_TO_RECIPIENT
        ) {
          throw badRequest(
            'FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED',
            'Feedback de sessão deve ser público',
          );
        }

        const session = await tx.session.findUnique({
          where: { id: sessionId },
          select: { status: true, campaignId: true, oneShotId: true },
        });
        if (!session)
          throw notFound('SESSION_NOT_FOUND', 'Sessão não encontrada');
        const author = await tx.sessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId, userId: authorId } },
          select: { status: true },
        });
        if (author?.status !== SessionParticipantStatus.ATTENDED) {
          throw forbidden(
            'FEEDBACK_AUTHOR_NOT_ATTENDED',
            'O autor precisa ter participado da sessão',
          );
        }
        if (session.status !== SessionStatus.COMPLETED) {
          throw conflict(
            'FEEDBACK_SESSION_NOT_COMPLETED',
            'A sessão precisa estar concluída para receber feedback',
          );
        }
        if (Boolean(session.campaignId) === Boolean(session.oneShotId)) {
          throw conflict(
            'SESSION_WITHOUT_TABLE',
            'A sessão precisa pertencer a uma única mesa',
          );
        }

        if (target.targetUserId !== null) {
          const recipient = await tx.sessionParticipant.findUnique({
            where: {
              sessionId_userId: { sessionId, userId: target.targetUserId },
            },
            select: { status: true, role: true },
          });
          const requiredRole =
            target.targetType === FeedbackTargetType.MASTER
              ? SessionParticipantRole.MASTER
              : SessionParticipantRole.PLAYER;
          if (
            recipient?.status !== SessionParticipantStatus.ATTENDED ||
            recipient.role !== requiredRole
          ) {
            throw forbidden(
              'FEEDBACK_RECIPIENT_NOT_ELIGIBLE',
              'O destinatário precisa ter participado da sessão com o papel correspondente',
            );
          }
        }

        const createdAt = new Date();
        return tx.feedback.create({
          data: {
            authorId,
            sessionId,
            ...target,
            rating,
            comment,
            visibility,
            createdAt,
            editableUntil: new Date(
              createdAt.getTime() + FEEDBACK_EDIT_WINDOW_MS,
            ),
          },
          select: createdFeedbackSelect,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw conflict(
          'FEEDBACK_ALREADY_EXISTS',
          'Você já enviou feedback para este alvo nesta sessão',
        );
      }
      throw error;
    }
  }
}
