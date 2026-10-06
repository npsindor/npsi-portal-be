import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const OTP_TTL = 10 * MINUTE;
export const SESSION_TTL = 30 * DAY;
export const RESET_TTL = 30 * MINUTE;
export const INVITE_TTL = 7 * DAY;
const fromNow = (ms: number): Date => new Date(Date.now() + ms);

const nullableText = (value: unknown): string | null => (value === null || value === undefined || value === "" ? null : String(value));

// Data access for the `users` table. Emails compare case-insensitively through
// the column collation. Expiry times are UTC, like everything else stored.
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserRow | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findIdByPhone(phone: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({ where: { phone }, select: { id: true } });
  }

  findByEmail(email: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { email } });
  }

  findIdByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({ where: { email }, select: { id: true } });
  }

  findForLogin(identifier: string, phone: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone }] } });
  }

  async insertRegistered(id: string, email: string, fullName: string | null, phone: string, passwordHash: string): Promise<void> {
    await this.prisma.user.create({ data: { id, email: email.toLowerCase(), fullName, phone, passwordHash, isVerified: false } });
  }

  async setOtp(userId: string, otpHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { otpHash, otpExpiresAt: fromNow(OTP_TTL), updatedAt: new Date() } });
  }

  async verifyAndStartSession(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: true, sessionToken: tokenHash, sessionExpiresAt: fromNow(SESSION_TTL), otpHash: null, otpExpiresAt: null, updatedAt: new Date() },
    });
  }

  async startSession(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { sessionToken: tokenHash, sessionExpiresAt: fromNow(SESSION_TTL), updatedAt: new Date() } });
  }

  async setResetTokenByEmail(email: string, tokenHash: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { email },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: fromNow(RESET_TTL), updatedAt: new Date() },
    });
  }

  // Returns the number of users changed (0 when the token is unknown or expired).
  async resetPassword(passwordHash: string, tokenHash: string): Promise<number> {
    const { count } = await this.prisma.user.updateMany({
      where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, isVerified: true, updatedAt: new Date() },
    });
    return count;
  }

  async insertInvited(id: string, email: string, fullName: unknown, phone: unknown, passwordHash: string, role: "admin" | "user"): Promise<void> {
    await this.prisma.user.create({
      data: { id, email, fullName: nullableText(fullName), phone: nullableText(phone), passwordHash, role, status: "invited", isVerified: true },
    });
  }

  // Name and phone only change when given.
  async updateInvited(userId: string, fullName: unknown, phone: unknown, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: nullableText(fullName) ?? undefined,
        phone: nullableText(phone) ?? undefined,
        passwordHash,
        isVerified: true,
        status: "invited",
        updatedAt: new Date(),
      },
    });
  }

  async setInviteResetToken(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: fromNow(INVITE_TTL), updatedAt: new Date() },
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, updatedAt: new Date() } });
  }

  // Never called without a token: an empty filter would match every user.
  async clearSession(tokenHash: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { sessionToken: tokenHash }, data: { sessionToken: null, sessionExpiresAt: null } });
  }
}
