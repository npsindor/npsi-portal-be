import { Injectable } from "@nestjs/common";
import type { UserRow } from "../../common/session/session.service.js";
import { DatabaseService } from "../../database/database.service.js";

// All SQL on the `users` table, unchanged from the legacy handlers.
@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  findById(id: string): Promise<UserRow | undefined> {
    return this.db.first<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
  }

  findIdByPhone(phone: string): Promise<{ id: string } | undefined> {
    return this.db.first<{ id: string }>("SELECT id FROM users WHERE phone = ?", [phone]);
  }

  findByEmail(email: string): Promise<UserRow | undefined> {
    return this.db.first<UserRow>("SELECT * FROM users WHERE email = ?", [email]);
  }

  findByEmailLimit1(email: string): Promise<UserRow | undefined> {
    return this.db.first<UserRow>("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
  }

  findIdByEmail(email: string): Promise<{ id: string } | undefined> {
    return this.db.first<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  }

  findForLogin(identifier: string, phone: string): Promise<UserRow | undefined> {
    return this.db.first<UserRow>("SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR phone = ? LIMIT 1", [identifier, phone]);
  }

  async insertRegistered(id: string, email: string, fullName: string | null, phone: string, passwordHash: string): Promise<void> {
    await this.db.execute("INSERT INTO users (id, email, full_name, phone, password_hash, is_verified) VALUES (?, LOWER(?), ?, ?, ?, FALSE)", [
      id,
      email,
      fullName,
      phone,
      passwordHash,
    ]);
  }

  async setOtp(userId: string, otpHash: string): Promise<void> {
    await this.db.execute("UPDATE users SET otp_hash = ?, otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE), updated_at = NOW() WHERE id = ?", [
      otpHash,
      userId,
    ]);
  }

  async verifyAndStartSession(userId: string, token: string): Promise<void> {
    await this.db.execute(
      "UPDATE users SET is_verified = TRUE, session_token = ?, session_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), otp_hash = NULL, otp_expires_at = NULL, updated_at = NOW() WHERE id = ?",
      [token, userId],
    );
  }

  async startSession(userId: string, token: string): Promise<void> {
    await this.db.execute("UPDATE users SET session_token = ?, session_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), updated_at = NOW() WHERE id = ?", [
      token,
      userId,
    ]);
  }

  async setResetTokenByEmail(email: string, tokenHash: string): Promise<void> {
    await this.db.execute(
      "UPDATE users SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE), updated_at = NOW() WHERE email = ?",
      [tokenHash, email],
    );
  }

  // Returns the number of rows changed (0 when the token is unknown or expired).
  async resetPassword(passwordHash: string, tokenHash: string): Promise<number> {
    const [, result] = await this.db.execute(
      "UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL, is_verified = TRUE, updated_at = NOW() WHERE reset_token_hash = ? AND reset_token_expires_at > NOW()",
      [passwordHash, tokenHash],
    );
    return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
  }

  async insertInvited(id: string, email: string, fullName: unknown, phone: unknown, passwordHash: string, role: "admin" | "user"): Promise<void> {
    await this.db.execute(
      "INSERT INTO users (id, email, full_name, phone, password_hash, role, status, is_verified) VALUES (?, ?, ?, ?, ?, ?, 'invited', TRUE)",
      [id, email, fullName || null, phone || null, passwordHash, role],
    );
  }

  async updateInvited(userId: string, fullName: unknown, phone: unknown, passwordHash: string): Promise<void> {
    await this.db.execute(
      "UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), password_hash = ?, is_verified = TRUE, status = 'invited', updated_at = NOW() WHERE id = ?",
      [fullName, phone, passwordHash, userId],
    );
  }

  async setInviteResetToken(userId: string, tokenHash: string): Promise<void> {
    await this.db.execute("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY), updated_at = NOW() WHERE id = ?", [
      tokenHash,
      userId,
    ]);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.db.execute("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [passwordHash, userId]);
  }

  // `token` may be undefined (no Authorization header): the driver then rejects
  // the query, which is the legacy behavior for logout without a token.
  async clearSession(token: string | undefined): Promise<void> {
    await this.db.execute("UPDATE users SET session_token = NULL, session_expires_at = NULL WHERE session_token = ?", [token]);
  }
}
