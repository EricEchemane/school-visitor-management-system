import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../services/auth.service';
import { forbidden, unauthorized } from './errors';
import { Permission } from '../domain/permissions';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: string[];
}

const PERM_KEY = 'permissions';
const PUBLIC_KEY = 'public';

/** Caller needs at least one of the listed permissions. */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERM_KEY, permissions);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

export const SESSION_COOKIE = 'sid';

/** Global guard: every route needs a valid session unless marked @Public. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.authenticate(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw unauthorized();
    req.user = user;

    const needed = this.reflector.getAllAndOverride<string[]>(PERM_KEY, targets);
    if (needed?.length && !needed.some((p) => user.permissions.includes(p))) throw forbidden();
    return true;
  }
}

export const can = (user: AuthUser, permission: Permission) => user.permissions.includes(permission);
