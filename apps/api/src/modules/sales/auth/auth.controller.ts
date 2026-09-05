import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../../shared/current-user.decorator';
import { Public } from '../../../shared/jwt-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SignupDto } from '../dto';
import { PrismaService } from '../../../shared/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public() @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public() @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public() @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { role: true },
    });
    return row
      ? { id: row.id, email: row.email, name: row.name, role: row.role.name, customerId: row.customerId }
      : null;
  }
}
