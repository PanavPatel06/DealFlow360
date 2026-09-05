import { Injectable } from '@nestjs/common';
import { AuthTokens, AuthUser, ErrorCode, UserRole } from '@dealflow/contracts';
import { PrismaService } from '../../../shared/prisma.service';
import { AppError } from '../../../shared/app-error';
import { hashPassword, verifyPassword } from './password';
import { ACCESS_TTL, REFRESH_TTL, sign, verify } from './token';
import type { LoginDto, SignupDto } from '../dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private issue(user: {
    id: string;
    email: string;
    name: string;
    customerId: string | null;
    role: { name: string };
  }): AuthTokens {
    const claims = { sub: user.id, role: user.role.name, customerId: user.customerId };
    return {
      accessToken: sign({ ...claims, typ: 'access' }, ACCESS_TTL),
      refreshToken: sign({ ...claims, typ: 'refresh' }, REFRESH_TTL),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name as UserRole,
        customerId: user.customerId,
      } satisfies AuthUser,
    };
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { role: true },
    });
    if (!user || !user.isActive || !verifyPassword(dto.password, user.passwordHash)) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'Email or password is incorrect.');
    }
    return this.issue(user);
  }

  async signup(dto: SignupDto): Promise<AuthTokens> {
    if (dto.role === UserRole.CUSTOMER && !dto.customerId) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'A customer user needs a customerId.');
    }
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new AppError(ErrorCode.VALIDATION_FAILED, 'Unknown role.', { role: dto.role });

    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'That email is already registered.');
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash: hashPassword(dto.password),
        roleId: role.id,
        customerId: dto.role === UserRole.CUSTOMER ? dto.customerId! : null,
      },
      include: { role: true },
    });
    return this.issue(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verify(refreshToken);
    if (!payload || payload.typ !== 'refresh') {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'The refresh token is not valid.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || !user.isActive) {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'This user can no longer sign in.');
    }
    return this.issue(user);
  }
}
