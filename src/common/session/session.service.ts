import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { sessionIdle } from "../../auth/users.repository.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { User } from "../../generated/prisma/client.js";
import { LOGIN_USER_STATUSES } from "../eligibility/login-account.js";
import { ApiError } from "../filters/api-error.js";
import { sha256 } from "../utils/crypto.js";
import { cookieToken } from "./session-cookie.js";

export type UserRow = User;

export const AUTH_REQUIRED = "Authentication required.";
export const ADMIN_REQUIRED = "Admin access required.";

// The session token travels only in the httpOnly session cookie. An Authorization header is ignored, so a token a
// page script might read can never be replayed from elsewhere.
export const bearerToken = (request: Request): string | undefined => cookieToken(request);

// lastSeenAt is written at most this often (not on every request).
const TOUCH_EVERY = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async getBearerUser(request: Request): Promise<UserRow | null> {
    const token = bearerToken(request);
    if (!token) return null;
    // Only a SHA-256 of each session token is stored, so a database copy can't be used to log in.
    const now = new Date();
    const session = await this.prisma.session.findFirst({ where: { id: sha256(token), expiresAt: { gt: now } }, include: { user: true } });
    // A suspended/disabled account is logged out everywhere at once, not only refused at the next login.
    if (!session?.user || !LOGIN_USER_STATUSES.includes(session.user.status)) return null;
    // Idle timeout: a session unused for longer than its role allows has ended.
    const lastSeen = session.lastSeenAt ?? session.createdAt;
    if (now.getTime() - lastSeen.getTime() > sessionIdle(session.user.role)) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (now.getTime() - lastSeen.getTime() > TOUCH_EVERY) await this.prisma.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: now } });
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
