import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { SessionService, type UserRow } from "../session/session.service.js";

export type AuthenticatedRequest = Request & { user?: UserRow };

// Any logged-in user; 401 `{ error: "Authentication required." }` otherwise.
@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.sessions.requireUser(request);
    return true;
  }
}

// Admins only; 401 when not logged in, 403 `{ error: "Admin access required." }` otherwise.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.sessions.requireAdmin(request);
    return true;
  }
}
