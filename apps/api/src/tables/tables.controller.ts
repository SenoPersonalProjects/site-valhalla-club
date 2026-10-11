import { Controller, Get } from '@nestjs/common';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { TablesService } from './tables.service';

@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get('me')
  findMine(@CurrentUserId() userId: string) {
    return this.tablesService.findForUser(userId);
  }
}
