import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { OkVo } from "../common/filters/error.vo.js";
import { adminNewRegistrationEmail, memberInviteEmail, memberWelcomeEmail } from "../common/mail/email-templates.js";
import { MailService } from "../common/mail/mail.service.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { createToken, generateOtp, hashOtp, hashPassword, randomId, randomInvitePassword, safeEqual, sha256, verifyPassword } from "../common/utils/crypto.js";
import { normalizeMobile } from "../common/utils/records.js";
import { AppConfigService } from "../config/app-config.service.js";
import type { ChangePasswordDto, EmailDto, InviteDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyOtpDto } from "./dto/auth.dto.js";
import { UsersRepository } from "./users.repository.js";
import { type InvitationVo, PublicUserVo, type RegistrationVo, type SessionVo } from "./vo/auth.vo.js";

const OK: OkVo = { ok: true };
const logMailError = (label: string) => (error: unknown) => console.error(`[mailer] ${label} failed:`, error instanceof Error ? error.message : error);

// Business rules for registration, OTP, sessions and passwords, ported
// unchanged from the legacy Express handlers (same checks, order and messages).
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly mail: MailService,
    private readonly recaptcha: RecaptchaService,
    private readonly config: AppConfigService,
  ) {}

  async register(body: RegisterDto): Promise<RegistrationVo> {
    const { email, password, full_name, phone, recaptchaToken } = body || {};
    if (!(await this.recaptcha.verify(recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    if (!email || !password || password.length < 6) throw new ApiError(400, "Email and password are required; password must be at least 6 characters.");
    if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (await this.users.findIdByPhone(phone.trim())) throw new ApiError(409, "This mobile number is already registered.");
    const id = randomId();
    try {
      await this.users.insertRegistered(id, email.trim(), full_name?.trim() || null, phone.trim(), hashPassword(password));
    } catch (error) {
      // P2002 = unique constraint violation (users.email).
      if ((error as { code?: string }).code === "P2002") throw new ApiError(409, "An account with this email already exists.");
      throw error;
    }
    const user = (await this.users.findById(id)) as UserRow;
    this.issueOtp(user).catch(logMailError("otp email"));
    return { user: PublicUserVo.from(user), requiresOtp: true };
  }

  async verifyOtp(body: VerifyOtpDto): Promise<SessionVo> {
    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    const code = String(body?.otpCode || "").trim();
    if (!email || !/^\d{6}$/.test(code)) throw new ApiError(400, "A valid 6-digit verification code is required.");
    const existing = await this.users.findByEmail(email);
    if (!existing) throw new ApiError(404, "Account not found.");
    const notExpired = existing.otp_expires_at && new Date(existing.otp_expires_at) > new Date();
    const matches = existing.otp_hash && safeEqual(hashOtp(code), existing.otp_hash);
    if (!notExpired || !matches) throw new ApiError(400, "Invalid or expired verification code.");
    const isFirstVerification = !existing.is_verified;
    const token = createToken();
    await this.users.verifyAndStartSession(existing.id, sha256(token));
    const user = (await this.users.findById(existing.id)) as UserRow;
    if (isFirstVerification) this.sendRegistrationEmails(user).catch(logMailError("registration email"));
    return { user: PublicUserVo.from(user), access_token: token };
  }

  // Same response whether or not the account exists, so this can't be used to
  // probe which emails are registered.
  async resendOtp(body: EmailDto): Promise<OkVo> {
    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    if (!email) throw new ApiError(400, "Email is required.");
    const user = await this.users.findByEmailLimit1(email);
    if (user && !user.is_verified) await this.issueOtp(user).catch(logMailError("otp email"));
    return OK;
  }

  async login(body: LoginDto): Promise<SessionVo> {
    const rawIdentifier = body?.email || body?.phone || body?.username || "";
    const identifier = String(rawIdentifier).trim();
    const phone = normalizeMobile(identifier);
    const user = await this.users.findForLogin(identifier, phone || identifier);
    if (!user || !verifyPassword(body?.password || "", user.password_hash)) throw new ApiError(401, "Invalid email/phone or password.");
    if (!user.is_verified) throw new ApiError(403, "Please verify your account before logging in.");
    const token = createToken();
    await this.users.startSession(user.id, sha256(token));
    return { user: PublicUserVo.from(user), access_token: token };
  }

  // Always the same response, and the reset token only ever travels by email.
  async requestPasswordReset(body: EmailDto): Promise<OkVo> {
    const email = body?.email?.trim().toLowerCase();
    if (!email) throw new ApiError(400, "Email is required.");
    if (await this.users.findIdByEmail(email)) {
      const token = createToken();
      await this.users.setResetTokenByEmail(email, sha256(token));
      const resetUrl = `${this.config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
      // Best effort: SMTP errors must never reach this unauthenticated caller.
      await this.mail
        .send({
          to: email,
          subject: "Reset your password",
          html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`,
          text: `Reset your password: ${resetUrl} (expires in 30 minutes)`,
        })
        .catch(logMailError("reset email"));
    }
    return OK;
  }

  async resetPassword(body: ResetPasswordDto): Promise<OkVo> {
    const { resetToken, newPassword } = body || {};
    if (!resetToken || !newPassword || newPassword.length < 6)
      throw new ApiError(400, "A valid reset token and password of at least 6 characters are required.");
    const changed = await this.users.resetPassword(hashPassword(newPassword), sha256(resetToken));
    if (!changed) throw new ApiError(400, "This reset link is invalid or expired.");
    return OK;
  }

  // Admin-only (enforced by the controller guard): creates or re-invites an
  // account with a random temporary password, returned once in the response.
  async invite(body: InviteDto): Promise<InvitationVo> {
    const email = body?.email?.trim().toLowerCase();
    const { role, full_name, phone } = body || {};
    if (!email) throw new ApiError(400, "Email is required.");
    const loginPhone = normalizeMobile(phone || email);
    const defaultPassword = randomInvitePassword();
    let user = await this.users.findByEmailLimit1(email);
    if (!user) {
      const id = randomId();
      await this.users.insertInvited(id, email, full_name, phone, hashPassword(defaultPassword), role === "admin" ? "admin" : "user");
      user = (await this.users.findById(id)) as UserRow;
    } else {
      await this.users.updateInvited(user.id, full_name || user.full_name, phone || user.phone, hashPassword(defaultPassword));
      user = (await this.users.findById(user.id)) as UserRow;
    }
    const token = createToken();
    await this.users.setInviteResetToken(user.id, sha256(token));
    const setPasswordUrl = `${this.config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const loginUrl = `${this.config.frontendUrl}/login`;
    const username = user.email || user.phone || loginPhone;
    const invite = memberInviteEmail({ name: user.full_name || email.split("@")[0], setPasswordUrl, loginUrl, username, password: defaultPassword });
    await this.mail.send({ to: email, subject: invite.subject, html: invite.html, text: invite.text }).catch(logMailError("invite email"));
    return { ok: true, username, password: defaultPassword };
  }

  async changePassword(user: UserRow, body: ChangePasswordDto): Promise<OkVo> {
    const { currentPassword, newPassword } = body || {};
    if (!newPassword || newPassword.length < 6) throw new ApiError(400, "New password must be at least 6 characters.");
    if (!verifyPassword(currentPassword || "", user.password_hash)) throw new ApiError(401, "Current password is incorrect.");
    await this.users.updatePassword(user.id, hashPassword(newPassword));
    return OK;
  }

  me(user: UserRow): PublicUserVo {
    return PublicUserVo.from(user);
  }

  // Without a token there is no session to end; still a 204 for the caller.
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.users.clearSession(sha256(token));
  }

  // Fresh single-use OTP, valid 10 minutes, sent by email.
  async issueOtp(user: UserRow): Promise<void> {
    const code = generateOtp();
    await this.users.setOtp(user.id, hashOtp(code));
    await this.mail.send({
      to: user.email as string,
      subject: "Your verification code",
      html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    });
  }

  async sendRegistrationEmails(user: UserRow): Promise<void> {
    const email = user.email as string;
    const name = user.full_name || email.split("@")[0];
    const welcome = memberWelcomeEmail({ name, loginUrl: `${this.config.frontendUrl}/login` });
    await this.mail.send({ to: email, subject: welcome.subject, html: welcome.html, text: welcome.text });
    const registeredAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const admin = adminNewRegistrationEmail({ name, email, phone: user.phone, registeredAt });
    await this.mail.send({ to: this.config.adminEmails.join(","), subject: admin.subject, html: admin.html, text: admin.text });
  }
}
