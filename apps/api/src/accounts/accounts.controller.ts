import { Body, Controller, HttpCode, Patch, Post } from '@nestjs/common';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { RequestAccountDeletionDto, UpdateProfileDto } from './account.dto';
import { AccountsService } from './accounts.service';

@Controller('account')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Patch('profile')
  updateProfile(@CurrentUserId() id: string, @Body() dto: UpdateProfileDto) {
    return this.accounts.updateProfile(id, dto);
  }

  @Post('deletion-request')
  @HttpCode(200)
  requestDeletion(
    @CurrentUserId() id: string,
    @Body() _dto: RequestAccountDeletionDto,
  ) {
    return this.accounts.requestDeletion(id);
  }
}
