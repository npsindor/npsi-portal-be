import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import { MailService } from "../common/mail/mail.service.js";
import { MessagingService } from "../common/messaging/messaging.service.js";
import { createToken, generateOtp, hashOtp, randomId, safeEqual, sha256 } from "../common/utils/crypto.js";
import { normalizeMobile } from "../common/utils/text.js";
import { AppConfigService } from "../config/app-config.service.js";
import { OtpChallengesRepository } from "./otp-challenges.repository.js";

// Purposes the public mobile-code endpoint accepts. ADMIN_LOGIN is internal: only the administrator password step sends it.
export const OTP_PURPOSES = ["REGISTER", "RESET"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number] | "ADMIN_LOGIN";
export type OtpDelivery = "WHATSAPP" | "SMS" | "EMAIL" | "DEV";

const CODE_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_GAP_MS = 30 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export const MOBILE_REQUIRED = "A valid 10-digit mobile number is required.";
export const OTP_INVALID = "Invalid or expired verification code.";
export const OTP_TOO_MANY = "Too many verification attempts. Please request a new code.";
export const OTP_WAIT = "Please wait a moment before requesting another code.";
export const OTP_HOURLY = "Too many codes requested for this mobile number. Please try again in an hour.";
export const OTP_UNAVAILABLE = "The verification code could not be sent. Please try again later.";
export const OTP_CHECK_UNAVAILABLE = "The code could not be checked right now. Please try again in a moment.";
export const VERIFICATION_EXPIRED = "Your mobile verification has expired. Please verify your mobile number again.";

export const validMobile = (value: unknown): string => {
  const mobile = normalizeMobile(value);
  if (!/^[6-9]\d{9}$/.test(mobile)) throw new ApiError(400, MOBILE_REQUIRED);
  return mobile;
};

// One-time codes sent to a mobile number (WhatsApp, then SMS — a DLT flow with our code, or MSG91's OTP widget, which
// makes and checks its own code — then the email the caller gave as a fallback until MSG91 is configured). A correct code yields a short-lived single-use verification
// token, which registration / password reset then consume.
@Injectable()
export class MobileOtpService {
  constructor(
    private readonly challenges: OtpChallengesRepository,
    private readonly messaging: MessagingService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async send(mobile: string, purpose: OtpPurpose, fallbackEmail?: string | null): Promise<{ channel: OtpDelivery; expiresInSeconds: number }> {
    const now = Date.now();
    const last = await this.challenges.latest(mobile, purpose);
    if (last && now - last.createdAt.getTime() < RESEND_GAP_MS) throw new ApiError(429, OTP_WAIT);
    if ((await this.challenges.countSince(mobile, new Date(now - 60 * 60 * 1000))) >= MAX_PER_HOUR) throw new ApiError(429, OTP_HOURLY);
    const code = generateOtp();
    let channel: OtpDelivery | null = await this.messaging.sendOtp(mobile, code);
    // No WhatsApp / DLT flow (or it failed): MSG91's OTP widget sends its own code by SMS and checks it for us.
    let providerRequestId: string | null = null;
    if (!channel) {
      providerRequestId = await this.messaging.sendWidgetOtp(mobile);
      if (providerRequestId) channel = "SMS";
    }
    if (!channel && fallbackEmail && this.mail.isConfigured()) {
      await this.mailCode(fallbackEmail, code);
      channel = "EMAIL";
    }
    // A code that went to the mobile is never also emailed: the email on an account may have been proven by someone
    // other than the mobile's owner, and a copy would let them take the account back (security finding 34).
    if (!channel && this.config.appEnv === "development") {
      console.warn(`[otp] development only — code for ${mobile.slice(0, 2)}******${mobile.slice(-2)}: ${code}`);
      channel = "DEV";
    }
    if (!channel) throw new ApiError(503, OTP_UNAVAILABLE);
    await this.challenges.create({
      id: randomId(),
      mobileDigits: mobile,
      purpose,
      // A widget code is MSG91's, not ours: keep a hash of an unguessable value so only MSG91's check can pass.
      codeHash: providerRequestId ? hashOtp(createToken()) : hashOtp(code),
      providerRequestId,
      channel,
      expiresAt: new Date(now + CODE_TTL_MS),
    });
    return { channel, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  // Administrator sign-in: the code to the mobile only (WhatsApp / DLT flow / MSG91 widget), never emailed from here; on
  // false the caller sends its own emailed code instead. True too when a mobile code went out under 30 s ago (a repeated
  // password step), so the member keeps the code already on its way.
  async sendToMobileOnly(mobile: string, purpose: OtpPurpose): Promise<boolean> {
    const now = Date.now();
    const last = await this.challenges.latest(mobile, purpose);
    if (last && !last.verifiedAt && last.channel !== "EMAIL" && now - last.createdAt.getTime() < RESEND_GAP_MS) return true;
    if ((await this.challenges.countSince(mobile, new Date(now - 60 * 60 * 1000))) >= MAX_PER_HOUR) return false;
    const code = generateOtp();
    let channel: OtpDelivery | null = await this.messaging.sendOtp(mobile, code);
    let providerRequestId: string | null = null;
    if (!channel) {
      providerRequestId = await this.messaging.sendWidgetOtp(mobile);
      if (providerRequestId) channel = "SMS";
    }
    if (!channel) return false;
    await this.challenges.create({
      id: randomId(),
      mobileDigits: mobile,
      purpose,
      codeHash: providerRequestId ? hashOtp(createToken()) : hashOtp(code),
      providerRequestId,
      channel,
      expiresAt: new Date(now + CODE_TTL_MS),
    });
    return true;
  }

  // A code sendToMobileOnly sent: null when none is waiting (the caller checks its own code), true when right; a wrong
  // code throws like verify (and counts as an attempt).
  async checkPending(mobile: string, purpose: OtpPurpose, code: string): Promise<true | null> {
    const pending = await this.challenges.latest(mobile, purpose);
    if (!pending || pending.verifiedAt || pending.expiresAt.getTime() <= Date.now()) return null;
    await this.verify(mobile, purpose, code);
    return true;
  }

  private mailCode(to: string, code: string) {
    return this.mail.send({
      to,
      subject: "Your verification code / आपका सत्यापन कोड",
      html: `<p>Your NPS Indore verification code is / आपका सत्यापन कोड:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p><p>Valid for 10 minutes. / 10 मिनट तक मान्य।</p><p>If you did not ask for this, ignore this email. / यदि आपने यह अनुरोध नहीं किया है, तो इस ईमेल को अनदेखा करें।</p>`,
      text: `Your NPS Indore verification code is ${code}. Valid for 10 minutes. If you did not ask for this, ignore this email.`,
    });
  }

  async verify(mobile: string, purpose: OtpPurpose, code: string): Promise<string> {
    if (!/^\d{6}$/.test(code)) throw new ApiError(400, "A valid 6-digit verification code is required.");
    const challenge = await this.challenges.latest(mobile, purpose);
    if (!challenge || challenge.verifiedAt || challenge.expiresAt.getTime() <= Date.now()) throw new ApiError(400, OTP_INVALID);
    if (challenge.attempts >= MAX_ATTEMPTS) throw new ApiError(429, OTP_TOO_MANY);
    const correct = challenge.providerRequestId
      ? await this.messaging.verifyWidgetOtp(challenge.providerRequestId, code)
      : safeEqual(hashOtp(code), challenge.codeHash);
    // MSG91 unreachable: not the user's fault, so no attempt is counted.
    if (correct === null) throw new ApiError(503, OTP_CHECK_UNAVAILABLE);
    if (!correct) {
      await this.challenges.addAttempt(challenge.id);
      throw new ApiError(400, OTP_INVALID);
    }
    const token = createToken();
    await this.challenges.markVerified(challenge.id, sha256(token), new Date(Date.now() + TOKEN_TTL_MS));
    return token;
  }

  // Uses up a verification token. True when the code reached the mobile itself (WhatsApp / SMS, or the development
  // log); false when it went to the fallback email, which proves the email but not the mobile number.
  async consume(mobile: string, purpose: OtpPurpose, token: string | undefined): Promise<boolean> {
    const channel = token ? await this.challenges.consume(sha256(token), mobile, purpose) : null;
    if (!channel) throw new ApiError(400, VERIFICATION_EXPIRED);
    return channel !== "EMAIL";
  }
}
