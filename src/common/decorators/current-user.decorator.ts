import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest } from "../guards/auth.guards.js";
import type { UserRow } from "../session/session.service.js";

// The user attached by UserGuard/AdminGuard.
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): UserRow => {
  const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) throw new Error("CurrentUser used on a route without UserGuard/AdminGuard");
  return user;
});
