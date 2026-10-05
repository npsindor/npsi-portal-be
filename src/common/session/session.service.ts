import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "../../database/prisma.service.js";
import { ApiError } from "../filters/api-error.js";
import { sha256 } from "../utils/crypto.js";

export interface UserRow {
  [column: string]: unknown;
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  password_hash: string | null;
  is_verified: number | boolean;
  otp_hash?: string | null;
  otp_expires_at?: Date | string | null;
}

export const AUTH_REQUIRED = "Authentication required.";
export const ADMIN_REQUIRED = "Admin access required.";

// Same token handling as the legacy app: whatever follows an optional
// "Bearer " prefix in the Authorization header.
export const bearerToken = (request: Request): string | undefined => request.headers.authorization?.replace(/^Bearer\s+/i, "");

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async getBearerUser(request: Request): Promise<UserRow | null> {
    const token = bearerToken(request);
    if (!token) return null;
    // Only a SHA-256 of each session token is stored, so a database copy can't be used to log in.
    // Expiry is checked against the database clock (sessions are written with NOW()).
    const [user] = await this.prisma.$queryRaw<UserRow[]>`SELECT * FROM users WHERE session_token = ${sha256(token)} AND session_expires_at > NOW() LIMIT 1`;
    return user || null;
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
