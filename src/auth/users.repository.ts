import { Injectable } from "@nestjs/common";
import { type AdminScope, adminScopeOf } from "../common/admin-access/admin-scope.js";
import { type LoginAccount, loginAccount } from "../common/eligibility/login-account.js";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const OTP_TTL = 10 * MINUTE;
// Session lifetimes: absolute (from login) and idle (since the last request). Administrators, who can read every
// member's data, get much shorter ones.
export const SESSION_TTL = 14 * DAY;
export const SESSION_IDLE = 3 * DAY;
export const ADMIN_SESSION_TTL = 12 * 60 * MINUTE;
export const ADMIN_SESSION_IDLE = 2 * 60 * MINUTE;
export const sessionTtl = (role: string | null | undefined): number => (role === "admin" ? ADMIN_SESSION_TTL : SESSION_TTL);
export const sessionIdle = (role: string | null | undefined): number => (role === "admin" ? ADMIN_SESSION_IDLE : SESSION_IDLE);
export const RESET_TTL = 30 * MINUTE;
export const RESET_COOLDOWN = 5 * MINUTE;
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

  // Phone lookups (login, password reset, "already registered") only see numbers that were proven with a code sent to
  // the mobile itself; an unverified number belongs to nobody yet.
  findIdByPhone(phone: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({ where: { phone, phoneVerified: true }, select: { id: true } });
  }

  findByPhone(phone: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { phone, phoneVerified: true }, orderBy: { createdAt: "asc" } });
  }

  // An account created through mobile OTP: verified and active from the start; email is optional. The mobile counts as
  // verified only when the code reached it (not when it went to the fallback email).
  async insertMobileRegistered(
    id: string,
    email: string | null,
    fullName: string | null,
    phone: string,
    passwordHash: string,
    phoneVerified: boolean,
  ): Promise<void> {
    await this.prisma.user.create({ data: { id, email, fullName, phone, phoneVerified, passwordHash, role: "user", status: "active", isVerified: true } });
  }

  // Mobile-OTP password reset: new password, verified, every device logged out.
  async resetPasswordFor(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash, isVerified: true, resetTokenHash: null, resetTokenExpiresAt: null } }),
      this.prisma.session.deleteMany({ where: { userId } }),
    ]);
  }

  async markVerified(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
  }

  findByEmail(email: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { email } });
  }

  findIdByEmail(email: string): Promise<{ id: string } | null> {
    return this.prisma.user.findFirst({ where: { email }, select: { id: true } });
  }

  // The admin work this account may do (Admin → Assign roles), or null.
  adminAccess(user: UserRow): Promise<AdminScope | null> {
    return adminScopeOf(this.prisma, user);
  }

  // Family Member / Student / admin / no registration yet, from the registration records.
  loginAccount(user: UserRow): Promise<LoginAccount> {
    return loginAccount(this.prisma, user);
  }

  findForLogin(identifier: string, phone: string): Promise<UserRow | null> {
    return this.prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone, phoneVerified: true }] }, orderBy: { createdAt: "asc" } });
  }

  // Email registration: the email is proven by its code; the mobile typed on the form is not.
  async insertRegistered(id: string, email: string, fullName: string | null, phone: string, passwordHash: string): Promise<void> {
    await this.prisma.user.create({ data: { id, email: email.toLowerCase(), fullName, phone, phoneVerified: false, passwordHash, isVerified: false } });
  }

  async setOtp(userId: string, otpHash: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { otpHash, otpExpiresAt: fromNow(OTP_TTL) } });
  }

  // OTP verified: the account is verified and this device gets a session, together.
  async verifyAndStartSession(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { isVerified: true, otpHash: null, otpExpiresAt: null } }),
      this.prisma.session.create({ data: { id: tokenHash, userId, expiresAt: fromNow(await this.ttlOf(userId)), lastSeenAt: new Date() } }),
    ]);
  }

  private async ttlOf(userId: string): Promise<number> {
    return sessionTtl((await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role);
  }

  // A new session for this device; the user's other devices stay logged in.
  // Their expired sessions are tidied up on the way.
  async startSession(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } }),
      this.prisma.session.create({ data: { id: tokenHash, userId, expiresAt: fromNow(await this.ttlOf(userId)), lastSeenAt: new Date() } }),
    ]);
  }

  // Stores a new reset token unless one was issued in the last RESET_COOLDOWN, so nobody can flood a
  // member's inbox with reset emails (the earlier link stays valid). True when a new token was stored.
  async setResetTokenByEmail(email: string, tokenHash: string): Promise<boolean> {
    const { count } = await this.prisma.user.updateMany({
      where: { email, OR: [{ resetTokenExpiresAt: null }, { resetTokenExpiresAt: { lt: fromNow(RESET_TTL - RESET_COOLDOWN) } }] },
      data: { resetTokenHash: tokenHash, resetTokenExpiresAt: fromNow(RESET_TTL) },
    });
    return count > 0;
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

  updateProfile(
    userId: string,
    data: { fullName?: string | null; phone?: string | null; phoneVerified?: boolean; photoUrl?: string | null },
  ): Promise<UserRow> {
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
