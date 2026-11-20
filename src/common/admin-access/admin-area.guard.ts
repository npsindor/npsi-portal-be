import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../database/prisma.service.js";
import { ApiError } from "../filters/api-error.js";
import type { AuthenticatedRequest } from "../guards/auth.guards.js";
import { ADMIN_REQUIRED, SessionService } from "../session/session.service.js";
import { type AdminArea, type AdminScope, adminScopeOf } from "./admin-scope.js";

export const ADMIN_AREA_KEY = "adminArea";
// The admin area a route belongs to: super admins always pass; staff need that area.
export const AdminAreaRoute = (area: AdminArea) => SetMetadata(ADMIN_AREA_KEY, area);

export type ScopedRequest = AuthenticatedRequest & { adminScope?: AdminScope };

@Injectable()
export class AdminAreaGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly db: PrismaService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const user = await this.sessions.requireUser(request);
    request.user = user;
    const area = this.reflector.get<AdminArea | undefined>(ADMIN_AREA_KEY, context.getHandler());
    const scope = await adminScopeOf(this.db, user);
    if (!scope || (!scope.superAdmin && (!area || !scope.areas.includes(area)))) throw new ApiError(403, ADMIN_REQUIRED);
    request.adminScope = scope;
    return true;
  }
}

// The scope AdminAreaGuard attached.
export const CurrentAdminScope = createParamDecorator((_data: unknown, context: ExecutionContext): AdminScope => {
  const scope = context.switchToHttp().getRequest<ScopedRequest>().adminScope;
  if (!scope) throw new Error("CurrentAdminScope used on a route without AdminAreaGuard");
  return scope;
});
