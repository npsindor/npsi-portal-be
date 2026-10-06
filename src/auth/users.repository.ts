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
    await this.prisma.user.update({ where: { id: userId }, data: { otpHash, otpExpiresAt: fromNow(OTP_TTL) } });
  }

  // OTP verified: the account is verified and this device gets a session, together.
  async verifyAndStartSession(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { isVerified: true, otpHash: null, otpExpiresAt: null } }),
      this.prisma.session.create({ data: { id: tokenHash, userId, expiresAt: fromNow(SESSION_TTL) } }),
    ]);
  }

  // A new session for this device; the user's other devices stay logged in.
  // Their expired sessions are tidied up on the way.
  async startSession(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } }),
      this.prisma.session.create({ data: { id: tokenHash, userId, expiresAt: fromNow(SESSION_TTL) } }),
    ]);
  }

  async setResetTokenByEmail(email: string, tokenHash: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { email },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: fromNow(RESET_TTL) },
    });
  }

  // Sets the new password for the holder of a valid reset token and logs out
  // all of their devices. Returns false when the token is unknown or expired.
  async resetPassword(passwordHash: string, tokenHash: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({ where: { resetTokenHash: tokenHash, resetTokenExpiresAt: { gt: new Date() } }, select: { id: true } });
    if (!user) return false;
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { id: user.id, resetTokenHash: tokenHash },
        data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null, isVerified: true },
      }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    return count > 0;
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
      },
    });
  }

  async setInviteResetToken(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: fromNow(INVITE_TTL) },
    });
  }

  updateProfile(userId: string, data: { fullName?: string | null; phone?: string | null; photoUrl?: string | null }): Promise<UserRow> {
    return this.prisma.user.update({ where: { id: userId }, data: { ...data } });
  }

  // New password; every other device is logged out (the one making the change stays).
  async updatePassword(userId: string, passwordHash: string, keepTokenHash?: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.deleteMany({ where: { userId, ...(keepTokenHash ? { id: { not: keepTokenHash } } : {}) } }),
    ]);
  }

  // Logs out one device.
  async clearSession(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: tokenHash } });
  }

  // Logs out every device of this user.
  async clearAllSessions(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
