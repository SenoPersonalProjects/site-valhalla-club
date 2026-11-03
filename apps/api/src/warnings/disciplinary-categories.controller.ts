import { Controller, Get, Query } from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { DisciplinaryCategoriesService } from './disciplinary-categories.service';

@Controller('admin/disciplinary-categories')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class DisciplinaryCategoriesController {
  constructor(private readonly categories: DisciplinaryCategoriesService) {}

  @Get()
  list(@CurrentUserId() actorId: string, @Query() query: PaginationQueryDto) {
    return this.categories.list(actorId, query);
  }
}
