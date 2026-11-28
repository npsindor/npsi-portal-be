import { Injectable } from "@nestjs/common";
import { asPortal, assertLoginPortal } from "../common/eligibility/login-account.js";
import { ApiError } from "../common/filters/api-error.js";
import type { OkVo } from "../common/filters/error.vo.js";
import { adminNewRegistrationEmail, memberInviteEmail, memberWelcomeEmail } from "../common/mail/email-templates.js";
import { MailService } from "../common/mail/mail.service.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { createToken, generateOtp, hashOtp, hashPassword, randomId, randomInvitePassword, safeEqual, sha256, verifyPassword } from "../common/utils/crypto.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { EMAIL_PATTERN, normalizeMobile } from "../common/utils/text.js";
import { OWN_UPLOAD_URL } from "../common/utils/uploads.js";
import { AppConfigService } from "../config/app-config.service.js";
import type {
  ChangePasswordDto,
  EmailChangeConfirmDto,
  EmailChangeDto,
  EmailDto,
  InviteDto,
  LoginDto,
  MobileOtpDto,
  MobileRegisterDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateMeDto,
  VerifyMobileOtpDto,
  VerifyOtpDto,
} from "./dto/auth.dto.js";
import { MobileOtpService, type OtpPurpose, validMobile } from "./mobile-otp.service.js";
import { UsersRepository } from "./users.repository.js";
import {
  AccountVo,
  type CurrentSessionVo,
  type InvitationVo,
  type IssuedSession,
  type MeVo,
  type MobileOtpVo,
  type MobileVerificationVo,
  PublicUserVo,
  type RegistrationVo,
} from "./vo/auth.vo.js";

export const MOBILE_TAKEN = "This mobile number is already registered.";
export const NOT_VERIFIED = "Please verify your account before logging in.";
// Administrator sign-in has a second step: the code emailed to the admin after the password was right.
export const ADMIN_CODE_REQUIRED = "Enter the sign-in code sent to your email to finish logging in.";
export const ADMIN_CODE_SMS = "Enter the sign-in code sent by SMS to the mobile number on your account to finish logging in.";
export const ADMIN_EMAIL_REQUIRED = "Administrator accounts need an email address for the sign-in code. Ask another administrator to add one.";
export const ADMIN_CODE_NOT_SENT = "The sign-in code could not be sent. Please try again later.";
export const OTP_INVALID_CODE = "Invalid or expired verification code.";
export const COMMON_PASSWORD = "This password is too common and easy to guess. Choose a different one.";
const PASSWORD_RULE = "Password must be at least 8 characters.";

// Passwords from the top of public breach lists (compared case-insensitively): refused even though they are 8+ long.
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "11111111",
  "00000000",
  "88888888",
  "87654321",
  "12341234",
  "11223344",
  "12121212",
  "password",
  "password1",
  "password@123",
  "password@1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "p@ssword",
  "qwertyui",
  "qwerty123",
  "qwertyuiop",
  "1qaz2wsx",
  "1q2w3e4r",
  "iloveyou",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "abcd1234",
  "abc12345",
  "abcdefgh",
  "admin123",
  "admin@123",
  "administrator",
  "welcome1",
  "welcome123",
  "letmein1",
  "trustno1",
  "computer",
  "internet",
  "whatever",
  "india123",
  "india@123",
  "indore123",
  "patidar",
  "patidar123",
  "patidar@123",
  "npsindore",
  "npsi1234",
  "changeme",
  "default1",
]);
export const isCommonPassword = (value: string): boolean => COMMON_PASSWORDS.has(value.trim().toLowerCase());
const assertNotCommon = (value: string): void => {
  if (isCommonPassword(value)) throw new ApiError(400, COMMON_PASSWORD);
};

const OK: OkVo = { ok: true };
const EMAIL_CHANGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CHANGE_MAX_TRIES = 5;
const EMAIL_CODE_EXPIRED = "This code has expired. Ask for a new one.";
const maskEmail = (email: string): string =>
  email.replace(/^(.)(.*)(@.*)$/, (_m, first: string, rest: string, domain: string) => `${first}${"*".repeat(Math.min(rest.length, 6))}${domain}`);
const logMailError = (label: string) => (error: unknown) => console.error(`[mailer] ${label} failed:`, error instanceof Error ? error.message : error);

// A file served from this API's /uploads (see UploadsService): uuid name, image extension.

export const PHONE_NOT_VERIFIED = "Verify the new mobile number with the code sent to it.";

// A request's password field: a string of at least 8 characters (anything else, e.g. a number, is refused).
const isPassword = (value: unknown): value is string => typeof value === "string" && value.length >= 8;

// Business rules for registration, OTP, sessions and passwords, ported
// unchanged from the legacy Express handlers (same checks, order and messages).
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly mail: MailService,
    private readonly recaptcha: RecaptchaService,
    private readonly config: AppConfigService,
    private readonly mobileOtp: MobileOtpService,
  ) {}

  // Step 1 of mobile registration / password reset: send a code to the mobile (WhatsApp → SMS → email fallback).
  async requestMobileOtp(body: MobileOtpDto): Promise<MobileOtpVo> {
    const mobile = validMobile(body?.mobile);
    const purpose: OtpPurpose = body?.purpose === "RESET" ? "RESET" : "REGISTER";
    if (!(await this.recaptcha.verify(body?.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    if (purpose === "RESET") {
      // Same answer whether or not the number is registered, so this can't be used to probe accounts.
      const user = await this.users.findByPhone(mobile);
      if (!user) return { ok: true, channel: "WHATSAPP", expiresInSeconds: 600 };
      return { ok: true, ...(await this.mobileOtp.send(mobile, purpose, user.email)) };
    }
    const email = body?.email?.trim().toLowerCase() || null;
    if (email && !EMAIL_PATTERN.test(email)) throw new ApiError(400, "A valid email address is required.");
    if (await this.users.findIdByPhone(mobile)) throw new ApiError(409, MOBILE_TAKEN);
    if (email && (await this.users.findIdByEmail(email))) throw new ApiError(409, "An account with this email already exists.");
    return { ok: true, ...(await this.mobileOtp.send(mobile, purpose, email)) };
  }

  async verifyMobileOtp(body: VerifyMobileOtpDto): Promise<MobileVerificationVo> {
    const mobile = validMobile(body?.mobile);
    const purpose: OtpPurpose = body?.purpose === "RESET" ? "RESET" : "REGISTER";
    return { verificationToken: await this.mobileOtp.verify(mobile, purpose, String(body?.code || "").trim()) };
  }

  // Step 3 of mobile registration: the verified mobile + a password create an active account and log it in.
  async registerWithMobile(body: MobileRegisterDto): Promise<IssuedSession> {
    const mobile = validMobile(body?.phone);
    if (!isPassword(body?.password)) throw new ApiError(400, PASSWORD_RULE);
    const email = body.email?.trim().toLowerCase() || null;
    if (email && !EMAIL_PATTERN.test(email)) throw new ApiError(400, "A valid email address is required.");
    assertNotCommon(body.password);
    if (await this.users.findIdByPhone(mobile)) throw new ApiError(409, MOBILE_TAKEN);
    // When the code went to the fallback email (no WhatsApp / SMS), the email is proven but the mobile isn't: it is
    // stored unverified, so it can't log in or reset a password and doesn't block the number's real owner.
    const phoneVerified = await this.mobileOtp.consume(mobile, "REGISTER", body.verificationToken);
    if (!phoneVerified && !email) throw new ApiError(400, "Enter the email the verification code was sent to.");
    const id = randomId();
    try {
      await this.users.insertMobileRegistered(id, email, body.fullName?.trim().slice(0, 255) || null, mobile, hashPassword(body.password), phoneVerified);
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ApiError(409, "An account with this email already exists.");
      throw error;
    }
    const token = createToken();
    await this.users.startSession(id, sha256(token));
    const user = (await this.users.findById(id)) as UserRow;
    this.sendRegistrationEmails(user).catch(logMailError("registration email"));
    return { user: PublicUserVo.from(user), accessToken: token };
  }

  async register(body: RegisterDto): Promise<RegistrationVo> {
    const { email, password, fullName, phone, recaptchaToken } = body || {};
    if (!(await this.recaptcha.verify(recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    if (!email || !isPassword(password)) throw new ApiError(400, "Email and password are required; password must be at least 8 characters.");
    assertNotCommon(password);
    if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (await this.users.findIdByPhone(phone.trim())) throw new ApiError(409, "This mobile number is already registered.");
    const id = randomId();
    try {
      await this.users.insertRegistered(id, email.trim(), fullName?.trim() || null, phone.trim(), hashPassword(password));
    } catch (error) {
      // P2002 = unique constraint violation (users.email).
      if ((error as { code?: string }).code === "P2002") throw new ApiError(409, "An account with this email already exists.");
      throw error;
    }
    const user = (await this.users.findById(id)) as UserRow;
    this.issueOtp(user).catch(logMailError("otp email"));
    return { user: PublicUserVo.from(user), requiresOtp: true };
  }

  // The emailed code: first verification of a new account, and an administrator's second sign-in step. `email` may
  // also be the mobile number the administrator logged in with. An unknown account and a wrong code get the same
  // answer, so this can't be used to find out which emails are registered.
  async verifyOtp(body: VerifyOtpDto): Promise<IssuedSession> {
    const identifier = String(body?.email || "")
      .trim()
      .toLowerCase();
    const code = String(body?.otpCode || "").trim();
    if (!identifier || !/^\d{6}$/.test(code)) throw new ApiError(400, "A valid 6-digit verification code is required.");
    if (!(await this.recaptcha.verify(body?.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    const phone = identifier.includes("@") ? "" : normalizeMobile(identifier);
    const existing = phone ? await this.users.findByPhone(phone) : await this.users.findByEmail(identifier);
    const notExpired = existing?.otpExpiresAt && existing.otpExpiresAt > new Date();
    const matches = existing?.otpHash && safeEqual(hashOtp(code), existing.otpHash);
    // An administrator's code may instead have gone by SMS (MSG91 checks that one; a wrong code counts as an attempt).
    const bySms =
      existing && !(notExpired && matches) && existing.role === "admin" && existing.phone
        ? await this.mobileOtp.checkPending(existing.phone, "ADMIN_LOGIN", code)
        : null;
    if (!existing || (!(notExpired && matches) && !bySms)) throw new ApiError(400, OTP_INVALID_CODE);
    // Same portal rules as the password login: the code proves the email, not which portal the account may use.
    const account = await this.users.loginAccount(existing);
    assertLoginPortal(existing, account, asPortal(body?.portal));
    const isFirstVerification = !existing.isVerified;
    const token = createToken();
    await this.users.verifyAndStartSession(existing.id, sha256(token));
    const user = (await this.users.findById(existing.id)) as UserRow;
    if (isFirstVerification) this.sendRegistrationEmails(user).catch(logMailError("registration email"));
    return { user: PublicUserVo.from(user), accessToken: token, account: AccountVo.from(account) };
  }

  // True when the administrator's sign-in code went to their mobile; any failure falls back to the emailed code.
  private async adminCodeBySms(phone: string): Promise<boolean> {
    try {
      return await this.mobileOtp.sendToMobileOnly(phone, "ADMIN_LOGIN");
    } catch (error) {
      console.error("[auth] admin sign-in code by SMS failed:", error instanceof Error ? error.message : error);
      return false;
    }
  }

  // Same response whether or not the account exists, so this can't be used to
  // probe which emails are registered.
  async resendOtp(body: EmailDto): Promise<OkVo> {
    const email = String(body?.email || "")
      .trim()
      .toLowerCase();
    if (!email) throw new ApiError(400, "Email is required.");
    if (!(await this.recaptcha.verify(body?.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    const user = await this.users.findByEmail(email);
    if (user && !user.isVerified) await this.issueOtp(user).catch(logMailError("otp email"));
    return OK;
  }

  async login(body: LoginDto): Promise<IssuedSession> {
    if (!(await this.recaptcha.verify(body?.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    const rawIdentifier = body?.email || body?.phone || body?.username || "";
    const identifier = String(rawIdentifier).trim();
    const phone = normalizeMobile(identifier);
    const user = await this.users.findForLogin(identifier, phone || identifier);
    // Checked even when there is no such user (same time and the same 401 either way).
    if (!verifyPassword(body?.password, user?.passwordHash) || !user) throw new ApiError(401, "Invalid email/phone or password.");
    if (!user.isVerified) {
      // Send a fresh code so the login screen can go straight to the code entry.
      if (user.email) this.issueOtp(user).catch(logMailError("otp email"));
      throw new ApiError(403, NOT_VERIFIED);
    }
    // The password is right; now the account type, decided from its registration records, must match the portal.
    const account = await this.users.loginAccount(user);
    assertLoginPortal(user, account, asPortal(body?.portal));
    // Administrators finish with the code emailed to them (POST /auth/otp-verifications); no session until then.
    if (user.role === "admin" && this.config.adminLoginCode) {
      // A verified mobile gets the code by SMS; when that can't be sent, the emailed code below as before.
      if (user.phone && user.phoneVerified && (await this.adminCodeBySms(user.phone))) throw new ApiError(403, ADMIN_CODE_SMS);
      if (!user.email) throw new ApiError(403, ADMIN_EMAIL_REQUIRED);
      if (!this.mail.isConfigured() && this.config.appEnv !== "development") throw new ApiError(503, ADMIN_CODE_NOT_SENT);
      try {
        await this.issueOtp(user, "Your administrator sign-in code");
      } catch (error) {
        // The mail server refused or is down: say so plainly (the details go to the server log), never a bare 500.
        logMailError("admin sign-in code")(error);
        throw new ApiError(503, ADMIN_CODE_NOT_SENT);
      }
      throw new ApiError(403, ADMIN_CODE_REQUIRED);
    }
    const token = createToken();
    await this.users.startSession(user.id, sha256(token));
    return { user: PublicUserVo.from(user), accessToken: token, account: AccountVo.from(account) };
  }

  // Always the same response, and the reset token only ever travels by email.
  async requestPasswordReset(body: EmailDto): Promise<OkVo> {
    const email = body?.email?.trim().toLowerCase();
    if (!email) throw new ApiError(400, "Email is required.");
    if (!(await this.recaptcha.verify(body?.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    const token = createToken();
    // At most one email per account per few minutes (an earlier link stays valid); see setResetTokenByEmail.
    if ((await this.users.findIdByEmail(email)) && (await this.users.setResetTokenByEmail(email, sha256(token)))) {
      const resetUrl = `${this.config.frontendUrl}/reset-password#token=${encodeURIComponent(token)}`;
      // Not awaited: the reply must not take longer for a real account (that would reveal which emails exist).
      // Best effort: SMTP errors must never reach this unauthenticated caller.
      void this.mail
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
    if (body?.verificationToken) {
      const mobile = validMobile(body.phone);
      if (!isPassword(newPassword)) throw new ApiError(400, PASSWORD_RULE);
      assertNotCommon(newPassword);
      const user = await this.users.findByPhone(mobile);
      await this.mobileOtp.consume(mobile, "RESET", body.verificationToken);
      if (!user) throw new ApiError(400, "This reset link is invalid or expired.");
      await this.users.resetPasswordFor(user.id, hashPassword(newPassword));
      return OK;
    }
    if (!resetToken || typeof resetToken !== "string" || !isPassword(newPassword))
      throw new ApiError(400, "A valid reset token and password of at least 8 characters are required.");
    assertNotCommon(newPassword);
    const changed = await this.users.resetPassword(hashPassword(newPassword), sha256(resetToken)); // also logs out every device
    if (!changed) throw new ApiError(400, "This reset link is invalid or expired.");
    return OK;
  }

  // Admin-only (enforced by the controller guard): creates or re-invites an
  // account with a random temporary password, returned once in the response.
  async invite(body: InviteDto, kind: "family" | "student" = "family"): Promise<InvitationVo> {
    const email = body?.email?.trim().toLowerCase();
    const { role, fullName } = body || {};
    if (!email) throw new ApiError(400, "Email is required.");
    let user = await this.users.findByEmail(email);
    // Never hand someone else's mobile to this account: phone login would then match two users.
    const phoneOwner = body?.phone ? await this.users.findIdByPhone(body.phone) : null;
    const phone = phoneOwner && phoneOwner.id !== user?.id ? undefined : body?.phone;
    const loginPhone = normalizeMobile(phone || email);
    // An account that already has its own password keeps it: approval must not lock its owner out.
    if (user && user.status !== "invited" && user.passwordHash) {
      if (!user.isVerified) await this.users.markVerified(user.id);
      const loginUrl = `${this.config.frontendUrl}/login`;
      const approved = memberInviteEmail({
        name: user.fullName || email.split("@")[0],
        setPasswordUrl: loginUrl,
        loginUrl,
        username: user.email || user.phone,
        kind,
      });
      await this.mail.send({ to: email, subject: approved.subject, html: approved.html, text: approved.text }).catch(logMailError("approval email"));
      return { ok: true, username: user.email || user.phone || loginPhone, password: null };
    }
    const defaultPassword = randomInvitePassword();
    if (!user) {
      const id = randomId();
      await this.users.insertInvited(id, email, fullName, phone, hashPassword(defaultPassword), role === "admin" ? "admin" : "user");
      user = (await this.users.findById(id)) as UserRow;
    } else {
      await this.users.updateInvited(user.id, fullName || user.fullName, phone || user.phone, hashPassword(defaultPassword));
      user = (await this.users.findById(user.id)) as UserRow;
    }
    const token = createToken();
    await this.users.setInviteResetToken(user.id, sha256(token));
    const setPasswordUrl = `${this.config.frontendUrl}/reset-password#token=${encodeURIComponent(token)}`;
    const loginUrl = `${this.config.frontendUrl}/login`;
    const username = user.email || user.phone || loginPhone;
    const invite = memberInviteEmail({ name: user.fullName || email.split("@")[0], setPasswordUrl, loginUrl, username, password: defaultPassword, kind });
    await this.mail.send({ to: email, subject: invite.subject, html: invite.html, text: invite.text }).catch(logMailError("invite email"));
    return { ok: true, username, password: defaultPassword };
  }

  // The device making the change stays logged in; the user's other devices are logged out.
  async changePassword(user: UserRow, body: ChangePasswordDto, currentToken?: string): Promise<OkVo> {
    const { currentPassword, newPassword } = body || {};
    if (!isPassword(newPassword)) throw new ApiError(400, "New password must be at least 8 characters.");
    assertNotCommon(newPassword);
    if (!verifyPassword(currentPassword, user.passwordHash)) throw new ApiError(401, "Current password is incorrect.");
    if (newPassword === currentPassword) throw new ApiError(400, "The new password must be different from the current one.");
    await this.users.updatePassword(user.id, hashPassword(newPassword), currentToken ? sha256(currentToken) : undefined);
    return OK;
  }

  // Email change, step 1: the current password, then a code to the new address (nothing changes until it is entered).
  async requestEmailChange(user: UserRow, body: EmailChangeDto): Promise<{ ok: true; expiresInSeconds: number }> {
    const email = body?.email?.trim().toLowerCase() || "";
    if (!EMAIL_PATTERN.test(email)) throw new ApiError(400, "A valid email address is required.");
    if (email === user.email?.trim().toLowerCase()) throw new ApiError(400, "This is already your account email.");
    if (!verifyPassword(body?.currentPassword, user.passwordHash)) throw new ApiError(401, "Current password is incorrect.");
    const owner = await this.users.findIdByEmail(email);
    if (owner && owner.id !== user.id) throw new ApiError(409, "An account with this email already exists.");
    const code = generateOtp();
    await this.users.setPendingEmail(user.id, email, hashOtp(code), new Date(Date.now() + EMAIL_CHANGE_TTL_MS));
    const html = `<p>Your NPS Indore code to confirm this email for your account / आपके खाते में यह ईमेल जोड़ने का कोड:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p><p>Valid for 10 minutes. If you did not ask for this, ignore this email. / 10 मिनट तक मान्य।</p>`;
    const text = `Your NPS Indore email confirmation code is ${code}. Valid for 10 minutes.`;
    if (!this.mail.isConfigured() && this.config.appEnv === "development") console.info(`[dev] email change code for ${email}: ${code}`);
    else {
      try {
        await this.mail.send({ to: email, subject: "Confirm your new email", html, text });
      } catch (error) {
        logMailError("email change code")(error);
        throw new ApiError(503, "The code could not be emailed. Please try again shortly.");
      }
    }
    return { ok: true, expiresInSeconds: EMAIL_CHANGE_TTL_MS / 1000 };
  }

  // Email change, step 2: the right code moves the account to the new email, signs out every other device and tells
  // the old address (so whoever proved it can no longer reset the password through it).
  async confirmEmailChange(user: UserRow, body: EmailChangeConfirmDto, currentToken?: string): Promise<PublicUserVo> {
    const code = String(body?.code ?? "").trim();
    const pending = user.pendingEmail;
    if (!pending || !user.pendingEmailCodeHash || !user.pendingEmailExpiresAt || user.pendingEmailExpiresAt.getTime() < Date.now()) {
      throw new ApiError(400, EMAIL_CODE_EXPIRED);
    }
    if (!safeEqual(hashOtp(code), user.pendingEmailCodeHash)) {
      if ((await this.users.countEmailAttempt(user.id)) >= EMAIL_CHANGE_MAX_TRIES) {
        await this.users.clearPendingEmail(user.id);
        throw new ApiError(400, EMAIL_CODE_EXPIRED);
      }
      throw new ApiError(400, "The code is incorrect.");
    }
    const owner = await this.users.findIdByEmail(pending);
    if (owner && owner.id !== user.id) throw new ApiError(409, "An account with this email already exists.");
    const updated = await this.users.confirmEmail(user.id, pending, currentToken ? sha256(currentToken) : undefined);
    if (user.email) {
      void this.mail
        .send({
          to: user.email,
          subject: "Your NPS Indore account email was changed",
          html: `<p>The email of your NPS Indore account was changed to <b>${maskEmail(pending)}</b>. This address no longer signs in to the account.</p><p>If you did not do this, contact the NPS Indore office.</p>`,
          text: `The email of your NPS Indore account was changed to ${maskEmail(pending)}. If you did not do this, contact the NPS Indore office.`,
        })
        .catch(logMailError("email changed notice"));
    }
    return PublicUserVo.from(updated);
  }

  async me(user: UserRow): Promise<MeVo> {
    return { ...PublicUserVo.from(user), account: AccountVo.from(await this.users.loginAccount(user)), adminAccess: await this.users.adminAccess(user) };
  }

  async currentSession(user: UserRow | null): Promise<CurrentSessionVo> {
    return { user: user ? await this.me(user) : null };
  }

  // Name, mobile (unique, same rule as registration) and profile photo, which
  // must be one of our own uploads so no outside image can be linked.
  async updateMe(user: UserRow, body: UpdateMeDto): Promise<PublicUserVo> {
    assertNoMarkup(body);
    const fullName = body.fullName === undefined ? undefined : body.fullName?.trim() || null;
    let phone: string | null | undefined;
    let phoneVerified: boolean | undefined;
    if (body.phone !== undefined) {
      phone = body.phone?.trim() || null;
      if (phone && !/^[6-9]\d{9}$/.test(phone)) throw new ApiError(400, "A valid 10-digit mobile number is required.");
      const owner = phone ? await this.users.findIdByPhone(phone) : null;
      if (owner && owner.id !== user.id) throw new ApiError(409, "This mobile number is already registered.");
      // The mobile is a login identifier: a new number must be proven with the code sent to it
      // (POST /auth/mobile-otps and /verifications, purpose REGISTER), so nobody can claim someone else's.
      if (phone && phone !== normalizeMobile(user.phone ?? "")) {
        if (!body.phoneVerificationToken) throw new ApiError(400, PHONE_NOT_VERIFIED);
        phoneVerified = await this.mobileOtp.consume(phone, "REGISTER", body.phoneVerificationToken);
      } else if (phone && body.phoneVerificationToken) {
        // Verifying the number already on the account (e.g. registered while the code could only go by email).
        // An emailed code still doesn't prove the mobile, so it never turns a verified number back to unverified.
        phoneVerified = (await this.mobileOtp.consume(phone, "REGISTER", body.phoneVerificationToken)) || Boolean(user.phoneVerified);
      }
    }
    let photoUrl: string | null | undefined;
    if (body.photoUrl !== undefined) {
      photoUrl = body.photoUrl?.trim() || null;
      if (photoUrl && !OWN_UPLOAD_URL.test(photoUrl)) throw new ApiError(400, "The photo must be an image uploaded to the portal.");
    }
    return PublicUserVo.from(await this.users.updateProfile(user.id, { fullName, phone, phoneVerified, photoUrl }));
  }

  // Without a token there is no session to end; still a 204 for the caller.
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.users.clearSession(sha256(token));
  }

  // "Log out everywhere": ends every session of this user, this device's included.
  async logoutEverywhere(user: UserRow): Promise<void> {
    await this.users.clearAllSessions(user.id);
  }

  // Fresh single-use OTP, valid 10 minutes, sent by email.
  async issueOtp(user: UserRow, subject = "Your verification code"): Promise<void> {
    const code = generateOtp();
    await this.users.setOtp(user.id, hashOtp(code));
    // Local development without working email: the code goes to the server log instead (never on test / production).
    const devLog = () => console.info(`[dev] ${subject} for ${user.email}: ${code}`);
    if (!this.mail.isConfigured() && this.config.appEnv === "development") devLog();
    try {
      await this.mail.send({
        to: user.email as string,
        subject,
        html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
        text: `Your verification code is ${code}. It expires in 10 minutes.`,
      });
    } catch (error) {
      if (this.config.appEnv !== "development") throw error;
      logMailError("verification code")(error);
      devLog();
    }
  }

  async sendRegistrationEmails(user: UserRow): Promise<void> {
    const email = user.email;
    const name = user.fullName || email?.split("@")[0] || user.phone || "Member";
    if (email) {
      const welcome = memberWelcomeEmail({ name, loginUrl: `${this.config.frontendUrl}/login` });
      await this.mail.send({ to: email, subject: welcome.subject, html: welcome.html, text: welcome.text });
    }
    const registeredAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const admin = adminNewRegistrationEmail({ name, email, phone: user.phone, registeredAt });
    await this.mail.send({ to: this.config.adminEmails.join(","), subject: admin.subject, html: admin.html, text: admin.text });
  }
}
