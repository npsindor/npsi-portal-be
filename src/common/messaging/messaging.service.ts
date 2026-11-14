import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service.js";

const MSG91_BASE = "https://control.msg91.com/api/v5";
const TIMEOUT_MS = 10_000;

export type OtpChannel = "WHATSAPP" | "SMS";

// WhatsApp (and SMS fallback) through MSG91. Templates must be approved in the MSG91 panel:
//  - OTP: one body variable (the code); with MSG91_WHATSAPP_OTP_BUTTON=true also a copy-code button;
//  - notice: one body variable (the whole message text);
//  - SMS OTP: a DLT-approved flow whose variable is named MSG91_SMS_OTP_VAR (default "otp").
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
    return Boolean((this.whatsappReady && m.otpTemplate) || (m.authKey && m.smsOtpTemplateId));
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
