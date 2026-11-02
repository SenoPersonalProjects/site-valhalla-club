import { Injectable } from '@nestjs/common';
import { maxLength } from 'class-validator';
import { AUDIT_ACTION, AUDIT_ENTITY } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { AuthorizationService } from '../authorization/authorization.service';
import {
  FeedbackTargetType,
  FeedbackVisibility,
  Prisma,
} from '../generated/prisma/client';
import { badRequest, conflict, notFound } from '../tables/table-domain.errors';
import { TableRulesService } from '../tables/table-rules.service';
import {
  FEEDBACK_ACCOUNT_REQUIREMENT,
  FEEDBACK_EDIT_WINDOW_MS,
  FEEDBACK_FORBIDDEN_CHARACTER,
  FEEDBACK_MODERATION_REASON_MAX_LENGTH,
} from './feedback.constants';
import { HideFeedbackDto, UpdateFeedbackDto } from './feedback.dto';
import {
  feedbackComment,
  feedbackRating,
  feedbackVisibility,
} from './feedback.rules';
import {
  administrativeFeedbackSelect,
  createdFeedbackSelect,
} from './feedback.select';

@Injectable()
export class FeedbacksManagementService {
  constructor(
    private readonly authorization: AuthorizationService,
    private readonly rules: TableRulesService,
    private readonly audit: AuditService,
  ) {}

  async update(id: string, actorId: string, dto: UpdateFeedbackDto) {
    return this.rules.serializable(async (tx) => {
      await this.authorization.assertRoles(
        actorId,
        FEEDBACK_ACCOUNT_REQUIREMENT,
        tx,
      );
      const feedback = await tx.feedback.findFirst({
        where: { id, authorId: actorId, hiddenAt: null },
        select: createdFeedbackSelect,
      });
      if (!feedback)
        throw notFound('FEEDBACK_NOT_FOUND', 'Feedback não encontrado');
      const data: Prisma.FeedbackUpdateManyMutationInput = {};
      if (dto.rating !== undefined) data.rating = feedbackRating(dto.rating);
      if (dto.comment !== undefined)
        data.comment = feedbackComment(dto.comment);
      if (dto.visibility !== undefined)
        data.visibility = feedbackVisibility(dto.visibility);
      if (Object.keys(data).length === 0)
        throw badRequest(
          'FEEDBACK_UPDATE_EMPTY',
          'Informe nota, comentário ou visibilidade para editar',
        );
      if (
        feedback.targetType === FeedbackTargetType.SESSION &&
        data.visibility === FeedbackVisibility.PRIVATE_TO_RECIPIENT
      ) {
        throw badRequest(
          'FEEDBACK_SESSION_PRIVATE_NOT_ALLOWED',
          'Feedback de sessão deve ser público',
        );
      }
      // Anchor the upper bound to creation as well as the persisted deadline.
      // Recompute inside each retry, immediately before the conditional write.
      const now = new Date();
      if (
        now >= feedback.editableUntil ||
        now.getTime() >= feedback.createdAt.getTime() + FEEDBACK_EDIT_WINDOW_MS
      ) {
        throw conflict(
          'FEEDBACK_EDIT_WINDOW_CLOSED',
          'O prazo de edição do feedback terminou',
        );
      }
      const result = await tx.feedback.updateMany({
        where: {
          id,
          authorId: actorId,
          hiddenAt: null,
          editableUntil: { gt: now },
          createdAt: { gt: new Date(now.getTime() - FEEDBACK_EDIT_WINDOW_MS) },
        },
        data,
      });
      if (result.count !== 1)
        throw conflict(
          'FEEDBACK_EDIT_WINDOW_CLOSED',
          'O feedback não está mais disponível para edição',
        );
      const updated = await tx.feedback.findFirst({
        where: { id, authorId: actorId, hiddenAt: null },
        select: createdFeedbackSelect,
      });
      if (!updated)
        throw notFound('FEEDBACK_NOT_FOUND', 'Feedback não encontrado');
      return updated;
    });
  }

  async hide(
    id: string,
    actorId: string,
    dto: HideFeedbackDto,
    requestId?: string,
  ) {
    return this.rules.serializable(async (tx) => {
      await this.authorization.assertRoles(
        actorId,
        ADMINISTRATOR_REQUIREMENT,
        tx,
      );
      const reason = dto.reason;
      if (
        typeof reason !== 'string' ||
        !reason.trim() ||
        !maxLength(reason, FEEDBACK_MODERATION_REASON_MAX_LENGTH) ||
        reason.includes(FEEDBACK_FORBIDDEN_CHARACTER)
      ) {
        throw badRequest(
          'FEEDBACK_MODERATION_REASON_REQUIRED',
          'Informe um motivo válido para ocultar o feedback',
        );
      }
      const feedback = await tx.feedback.findFirst({
        where: { id },
        select: administrativeFeedbackSelect,
      });
      if (!feedback)
        throw notFound('FEEDBACK_NOT_FOUND', 'Feedback não encontrado');
      const changed = feedback.hiddenAt === null;
      const result = changed
        ? await tx.feedback.update({
            where: { id },
            data: {
              hiddenAt: new Date(),
              hiddenById: actorId,
              moderationReason: reason.trim(),
            },
            select: administrativeFeedbackSelect,
          })
        : feedback;
      await this.audit.record(tx, {
        action: AUDIT_ACTION.FEEDBACK_HIDDEN,
        entityType: AUDIT_ENTITY.FEEDBACK,
        entityId: id,
        actorId,
        requestId,
        metadata: { changed, sessionId: feedback.sessionId },
      });
      return result;
    });
  }
}
