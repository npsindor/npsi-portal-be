import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

// Text columns accept whatever the client sent, converted like MySQL did.
const nullableText = (value: unknown): string | null => (value === null || value === undefined || value === "" ? null : String(value));

// Data access for the `users` table. Reads use the Prisma client. Writes that
// set or check an expiry use tagged-template SQL so they keep using the
// database clock (NOW()), exactly as sessions, OTPs and reset tokens always have.
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRow | undefined> {
    return ((await this.prisma.user.findUnique({ where: { id } })) as UserRow | null) ?? undefined;
  }

  async findIdByPhone(phone: string): Promise<{ id: string } | undefined> {
    return (await this.prisma.user.findFirst({ where: { phone }, select: { id: true } })) ?? undefined;
  }

  // Email comparisons are case-insensitive through the column collation.
  async findByEmail(email: string): Promise<UserRow | undefined> {
    return ((await this.prisma.user.findFirst({ where: { email } })) as UserRow | null) ?? undefined;
  }

  findByEmailLimit1(email: string): Promise<UserRow | undefined> {
    return this.findByEmail(email);
  }

  async findIdByEmail(email: string): Promise<{ id: string } | undefined> {
    return (await this.prisma.user.findFirst({ where: { email }, select: { id: true } })) ?? undefined;
  }

  async findForLogin(identifier: string, phone: string): Promise<UserRow | undefined> {
    return ((await this.prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone }] } })) as UserRow | null) ?? undefined;
  }

  async insertRegistered(id: string, email: string, fullName: string | null, phone: string, passwordHash: string): Promise<void> {
    await this.prisma.user.create({ data: { id, email: email.toLowerCase(), full_name: fullName, phone, password_hash: passwordHash, is_verified: false } });
  }

  async setOtp(userId: string, otpHash: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE users SET otp_hash = ${otpHash}, otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE), updated_at = NOW() WHERE id = ${userId}`;
  }

  async verifyAndStartSession(userId: string, token: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE users SET is_verified = TRUE, session_token = ${token}, session_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), otp_hash = NULL, otp_expires_at = NULL, updated_at = NOW() WHERE id = ${userId}`;
  }

  async startSession(userId: string, token: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE users SET session_token = ${token}, session_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), updated_at = NOW() WHERE id = ${userId}`;
  }

  async setResetTokenByEmail(email: string, tokenHash: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE users SET reset_token_hash = ${tokenHash}, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE), updated_at = NOW() WHERE email = ${email}`;
  }

  // Returns the number of rows changed (0 when the token is unknown or expired).
  resetPassword(passwordHash: string, tokenHash: string): Promise<number> {
    return this.prisma
      .$executeRaw`UPDATE users SET password_hash = ${passwordHash}, reset_token_hash = NULL, reset_token_expires_at = NULL, is_verified = TRUE, updated_at = NOW() WHERE reset_token_hash = ${tokenHash} AND reset_token_expires_at > NOW()`;
  }

  async insertInvited(id: string, email: string, fullName: unknown, phone: unknown, passwordHash: string, role: "admin" | "user"): Promise<void> {
    await this.prisma.user.create({
      data: {
        id,
        email,
        full_name: nullableText(fullName),
        phone: nullableText(phone),
        password_hash: passwordHash,
        role,
        status: "invited",
        is_verified: true,
      },
    });
  }

  async updateInvited(userId: string, fullName: unknown, phone: unknown, passwordHash: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE users SET full_name = COALESCE(${nullableText(fullName)}, full_name), phone = COALESCE(${nullableText(phone)}, phone), password_hash = ${passwordHash}, is_verified = TRUE, status = 'invited', updated_at = NOW() WHERE id = ${userId}`;
  }

  async setInviteResetToken(userId: string, tokenHash: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE users SET reset_token_hash = ${tokenHash}, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY), updated_at = NOW() WHERE id = ${userId}`;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.$executeRaw`UPDATE users SET password_hash = ${passwordHash}, updated_at = NOW() WHERE id = ${userId}`;
  }

  // Never called without a token: an empty filter would match every user.
  async clearSession(token: string): Promise<void> {
    await this.prisma.user.updateMany({ where: { session_token: token }, data: { session_token: null, session_expires_at: null } });
  }
}
