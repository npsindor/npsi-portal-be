import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service.js";

const MSG91_BASE = "https://control.msg91.com/api/v5";
const WIDGET_BASE = "https://api.msg91.com/api/v5/widget";
const TIMEOUT_MS = 10_000;

export type OtpChannel = "WHATSAPP" | "SMS";

// WhatsApp (and SMS fallback) through MSG91. Templates must be approved in the MSG91 panel:
//  - OTP: one body variable (the code); with MSG91_WHATSAPP_OTP_BUTTON=true also a copy-code button;
//  - notice: one body variable (the whole message text);
//  - SMS OTP: a DLT-approved flow whose variable is named MSG91_SMS_OTP_VAR (default "otp");
//  - or, without DLT of our own, an OTP widget (MSG91_WIDGET_ID) with MSG91's default SMS template: MSG91 creates the
//    code and checks it (sendWidgetOtp / verifyWidgetOtp), so we never see that code.
// Nothing here throws for "not configured"; callers decide what to fall back to.
@Injectable()
export class MessagingService {
  constructor(private readonly config: AppConfigService) {}

  private get whatsappReady(): boolean {
    const m = this.config.msg91;
    return Boolean(m.authKey && m.whatsappNumber);
  }
  otpConfigured(): boolean {
    const m = this.config.msg91;
    return Boolean((this.whatsappReady && m.otpTemplate) || (m.authKey && m.smsOtpTemplateId) || this.widgetReady);
  }
  get widgetReady(): boolean {
    const m = this.config.msg91;
    return Boolean(m.authKey && m.widgetId);
  }

  // The channel that delivered the code, or null when none is configured or every channel failed.
  async sendOtp(mobile10: string, code: string): Promise<OtpChannel | null> {
    const m = this.config.msg91;
    if (this.whatsappReady && m.otpTemplate) {
      const components: Record<string, { type: string; value: string; subtype?: string }> = { body_1: { type: "text", value: code } };
      if (m.otpButton) components.button_1 = { subtype: "url", type: "text", value: code };
      if (await this.whatsappTemplate(mobile10, m.otpTemplate, components)) return "WHATSAPP";
    }
    if (m.authKey && m.smsOtpTemplateId) {
      const sent = await this.post("/flow/", {
        template_id: m.smsOtpTemplateId,
        short_url: "0",
        recipients: [{ mobiles: `91${mobile10}`, [m.smsOtpVar]: code }],
      });
      if (sent) return "SMS";
    }
    return null;
  }

  // MSG91's OTP widget sends its own code by SMS. Returns MSG91's request id (needed to check the code), or null.
  async sendWidgetOtp(mobile10: string): Promise<string | null> {
    if (!this.widgetReady) return null;
    const result = await this.widget("sendOtp", { widgetId: this.config.msg91.widgetId, identifier: `91${mobile10}` });
    return result.ok && typeof result.message === "string" && result.message ? result.message : null;
  }

  // Checks a code MSG91's widget sent: true when right, false when MSG91 refused it (wrong, expired or too many tries),
  // null when MSG91 could not be reached (the caller must not count that against the user).
  async verifyWidgetOtp(requestId: string, code: string): Promise<boolean | null> {
    if (!this.widgetReady) return null;
    const result = await this.widget("verifyOtp", { widgetId: this.config.msg91.widgetId, reqId: requestId, otp: code });
    if (result.unreachable) return null;
    return result.ok;
  }

  private async widget(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; unreachable: boolean; message?: unknown }> {
    try {
      const response = await fetch(`${WIDGET_BASE}/${path}`, {
        method: "POST",
        headers: { authkey: this.config.msg91.authKey as string, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const result = (await response.json().catch(() => ({}))) as { type?: string; message?: unknown; code?: unknown };
      const ok = response.ok && result.type === "success";
      // Never log the number, the code or the request id; the status and MSG91's error code are enough to diagnose.
      if (!ok) console.error(`[msg91] widget/${path} failed with HTTP ${response.status}${result.code ? ` (code ${result.code})` : ""}`);
      return { ok, unreachable: response.status >= 500, message: result.message };
    } catch (error) {
      console.error(`[msg91] widget/${path} failed:`, error instanceof Error ? error.message : error);
      return { ok: false, unreachable: true };
    }
  }

  // Best-effort WhatsApp notice (status updates). False when not configured or not delivered.
  async sendNotice(mobile10: string | null | undefined, text: string): Promise<boolean> {
    const m = this.config.msg91;
    if (!mobile10 || !/^[6-9]\d{9}$/.test(mobile10) || !this.whatsappReady || !m.noticeTemplate) return false;
    return this.whatsappTemplate(mobile10, m.noticeTemplate, { body_1: { type: "text", value: text.slice(0, 1000) } });
  }

  private whatsappTemplate(mobile10: string, name: string, components: Record<string, unknown>): Promise<boolean> {
    const m = this.config.msg91;
    return this.post("/whatsapp/whatsapp-outbound-message/bulk/", {
      integrated_number: m.whatsappNumber,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name,
          language: { code: m.language, policy: "deterministic" },
          ...(m.namespace ? { namespace: m.namespace } : {}),
          to_and_components: [{ to: [`91${mobile10}`], components }],
        },
      },
    });
  }

  private async post(path: string, body: unknown): Promise<boolean> {
    const authKey = this.config.msg91.authKey;
    if (!authKey) return false;
    try {
      const response = await fetch(`${MSG91_BASE}${path}`, {
        method: "POST",
        headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const result = (await response.json().catch(() => ({}))) as { type?: string; status?: string; hasError?: boolean };
      const ok = response.ok && result.type !== "error" && result.status !== "fail" && result.hasError !== true;
      // Never log the message body or number (PII / OTP); the status is enough to diagnose.
      if (!ok) console.error(`[msg91] ${path} failed with HTTP ${response.status}`);
      return ok;
    } catch (error) {
      console.error(`[msg91] ${path} failed:`, error instanceof Error ? error.message : error);
      return false;
    }
  }
}
