import { Controller, Get, Query } from '@nestjs/common';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { ListAuditLogsDto } from './audit.dto';
import { AuditService } from './audit.service';

@Controller('admin/audit-logs')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUserId() actorId: string, @Query() query: ListAuditLogsDto) {
    return this.audit.list(actorId, query);
  }
}
