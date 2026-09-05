import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, UserRole } from '@dealflow/contracts';
import { AppError } from './app-error';
import { verify } from '../modules/sales/auth/token';

export const PUBLIC_KEY = 'isPublic';
/** Login, signup, refresh and the token-addressed portal reads. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers?.authorization ?? '';
    const payload = header.startsWith('Bearer ') ? verify(header.slice(7)) : null;
    // A public route still identifies the caller when a token is present, so the
    // portal can check a logged-in customer against the quote it addresses.
    if (isPublic && (!payload || payload.typ !== 'access')) return true;
    if (!payload || payload.typ !== 'access') {
      throw new AppError(ErrorCode.UNAUTHENTICATED, 'A valid access token is required.');
    }
    req.user = { id: payload.sub, role: payload.role, customerId: payload.customerId ?? undefined };

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(payload.role as UserRole)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'This role cannot perform that action.', {
        role: payload.role,
      });
    }
    return true;
  }
}
