import { RequireRoles } from '../authorization/require-roles.decorator';
import { ADMINISTRATOR_REQUIREMENT } from '../authorization/authorization.policies';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUserId } from '../common/http/current-user-id.decorator';
import { LoginDto, RegisterDto, RegistrationReviewDto } from './auth.dto';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { AuthRateLimit } from './auth-rate-limit';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('register')
  @AuthRateLimit('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Public()
  @Post('login')
  @AuthRateLimit('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @Get('me')
  me(@CurrentUserId() id: string) {
    return this.auth.me(id);
  }
  @Post('logout')
  @HttpCode(204)
  logout(@CurrentUserId() id: string) {
    return this.auth.logout(id);
  }
}

@Controller('admin/users')
@RequireRoles(ADMINISTRATOR_REQUIREMENT)
export class RegistrationReviewController {
  constructor(private readonly auth: AuthService) {}
  @Patch(':id/registration-review')
  review(
    @Param('id') id: string,
    @CurrentUserId() reviewerId: string,
    @Body() dto: RegistrationReviewDto,
  ) {
    return this.auth.review(id, reviewerId, dto);
  }
}
