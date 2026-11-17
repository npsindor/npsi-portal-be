import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service.js";
import type { User } from "../../generated/prisma/client.js";
import { LOGIN_USER_STATUSES } from "../eligibility/login-account.js";
import { ApiError } from "../filters/api-error.js";
import { sha256 } from "../utils/crypto.js";
import { cookieToken } from "./session-cookie.js";

export type UserRow = User;

export const AUTH_REQUIRED = "Authentication required.";
export const ADMIN_REQUIRED = "Admin access required.";

// The session token: whatever follows an optional "Bearer " prefix in the
// Authorization header (API clients, older frontends), else the httpOnly session cookie.
export const bearerToken = (request: Request): string | undefined => request.headers.authorization?.replace(/^Bearer\s+/i, "") || cookieToken(request);

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async getBearerUser(request: Request): Promise<UserRow | null> {
    const token = bearerToken(request);
    if (!token) return null;
    // Only a SHA-256 of each session token is stored, so a database copy can't be used to log in.
    const session = await this.prisma.session.findFirst({ where: { id: sha256(token), expiresAt: { gt: new Date() } }, include: { user: true } });
    // A suspended/disabled account is logged out everywhere at once, not only refused at the next login.
    if (!session?.user || !LOGIN_USER_STATUSES.includes(session.user.status)) return null;
    return session.user;
  }

  async requireUser(request: Request): Promise<UserRow> {
    const user = await this.getBearerUser(request);
    if (!user) throw new ApiError(401, AUTH_REQUIRED);
    return user;
  }

  async requireAdmin(request: Request): Promise<UserRow> {
    const user = await this.requireUser(request);
    if (user.role !== "admin") throw new ApiError(403, ADMIN_REQUIRED);
    return user;
  }
}
