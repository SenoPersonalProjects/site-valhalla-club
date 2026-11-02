import { Injectable } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { notFound } from '../tables/table-domain.errors';
import { FEEDBACK_ACCOUNT_REQUIREMENT } from './feedback.constants';
import { ListFeedbacksDto } from './feedback.dto';
import {
  feedbackOffset,
  personalFeedbackScope,
  publicFeedbackScope,
} from './feedback-query.rules';
import {
  administrativeFeedbackSelect,
  createdFeedbackSelect,
  publicFeedbackSelect,
} from './feedback.select';

@Injectable()
export class FeedbacksQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async listPublic(sessionId: string, query: ListFeedbacksDto) {
    return this.prisma.$transaction(
      (tx) =>
        this.page(
          tx,
          { sessionId, ...publicFeedbackScope() },
          query,
          publicFeedbackSelect,
        ),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );
  }

  async listPersonal(
    sessionId: string,
    actorId: string,
    query: ListFeedbacksDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorization.assertRoles(
          actorId,
          FEEDBACK_ACCOUNT_REQUIREMENT,
          tx,
        );
        return this.page(
          tx,
          { sessionId, ...personalFeedbackScope(actorId) },
          query,
          createdFeedbackSelect,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findPersonal(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorization.assertRoles(
          actorId,
          FEEDBACK_ACCOUNT_REQUIREMENT,
          tx,
        );
        const feedback = await tx.feedback.findFirst({
          where: { id, ...personalFeedbackScope(actorId) },
          select: createdFeedbackSelect,
        });
        if (!feedback)
          throw notFound('FEEDBACK_NOT_FOUND', 'Feedback não encontrado');
        return feedback;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async listAdministrative(
    sessionId: string,
    actorId: string,
    query: ListFeedbacksDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          tx,
        );
        return this.page(
          tx,
          { sessionId },
          query,
          administrativeFeedbackSelect,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findAdministrative(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          tx,
        );
        const feedback = await tx.feedback.findFirst({
          where: { id },
          select: administrativeFeedbackSelect,
        });
        if (!feedback)
          throw notFound('FEEDBACK_NOT_FOUND', 'Feedback não encontrado');
        return feedback;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async page<TSelect extends Prisma.FeedbackSelect>(
    tx: Prisma.TransactionClient,
    scope: Prisma.FeedbackWhereInput,
    query: ListFeedbacksDto,
    select: TSelect,
  ) {
    const skip = feedbackOffset(query);
    const where: Prisma.FeedbackWhereInput = {
      ...scope,
      ...(query.targetType !== undefined
        ? { targetType: query.targetType }
        : {}),
    };
    const items = await tx.feedback.findMany({
      where,
      select,
      skip,
      take: query.limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const total = await tx.feedback.count({ where });
    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }
}
