import { BadRequestException, Injectable } from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { AuthorizationService } from '../authorization/authorization.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DISCIPLINARY_CATEGORY_MAX_OFFSET,
  DISCIPLINARY_CATEGORY_MAX_PAGE_LIMIT,
} from './disciplinary-categories.constants';

export const disciplinaryCategorySelect = {
  id: true,
  code: true,
  label: true,
} satisfies Prisma.DisciplinaryCategorySelect;

@Injectable()
export class DisciplinaryCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  list(actorId: string, query: PaginationQueryDto) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorization.assertRoles(
          actorId,
          ADMINISTRATOR_REQUIREMENT,
          tx,
        );
        const skip = (query.page - 1) * query.limit;
        if (
          !Number.isSafeInteger(query.page) ||
          query.page < 1 ||
          !Number.isSafeInteger(query.limit) ||
          query.limit < 1 ||
          query.limit > DISCIPLINARY_CATEGORY_MAX_PAGE_LIMIT ||
          !Number.isSafeInteger(skip) ||
          skip > DISCIPLINARY_CATEGORY_MAX_OFFSET
        ) {
          throw new BadRequestException({
            code: 'BAD_REQUEST',
            message: 'Paginação inválida',
          });
        }
        const where = { active: true };
        const items = await tx.disciplinaryCategory.findMany({
          where,
          select: disciplinaryCategorySelect,
          skip,
          take: query.limit,
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
        });
        const total = await tx.disciplinaryCategory.count({ where });
        return {
          items,
          meta: {
            page: query.page,
            limit: query.limit,
            total,
            pages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
