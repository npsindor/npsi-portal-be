import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service.js";

const RECAPTCHA_SCORE_THRESHOLD = 0.5;
export const RECAPTCHA_FAILED = "reCAPTCHA verification failed. Please try again.";

// Server-side Google reCAPTCHA v3 check, unchanged from the legacy app: the
// token is verified with Google using our secret, and low-scoring (bot-like)
// tokens are rejected. Not configured means "don't block anyone".
@Injectable()
export class RecaptchaService {
  constructor(private readonly config: AppConfigService) {}

  async verify(token: unknown): Promise<boolean> {
    const secret = this.config.recaptchaSecret;
    if (!secret) return true;
    if (!token || typeof token !== "string") return false;
    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }).toString(),
      });
      const result = (await response.json()) as { success?: boolean; score?: number };
      return Boolean(result.success) && (result.score === undefined || result.score >= RECAPTCHA_SCORE_THRESHOLD);
    } catch (error) {
      console.error("[recaptcha] verification request failed:", error instanceof Error ? error.message : error);
      return false;
    }
  }
}
