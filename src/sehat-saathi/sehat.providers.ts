import { Injectable } from "@nestjs/common";
import { MailService } from "../common/mail/mail.service.js";
import { AppConfigService } from "../config/app-config.service.js";

@Injectable()
export class SehatProviders {
  constructor(
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}
  capabilities() {
    const env = process.env;
    return {
      email: this.mail.isConfigured(),
      whatsapp:
        env.SEHAT_WHATSAPP_AUTHORIZED === "true" &&
        Boolean(
          env.SEHAT_WA_TOKEN &&
            /^\d+$/.test(env.SEHAT_WA_PHONE_ID || "") &&
            /^v\d+\.\d+$/.test(env.SEHAT_WA_VERSION || "") &&
            env.SEHAT_WA_TEMPLATE_EN &&
            env.SEHAT_WA_TEMPLATE_HI,
        ),
      inApp: true,
    };
  }
  async send(channel: string, recipient: { email: string | null; phone: string | null; lang: string }) {
    const hi = recipient.lang === "hi";
    const link = new URL("/medical", this.config.frontendUrl).href;
    // Notifications contain no medicine name, medical information, or member contact.
    const text = hi
      ? `सेहत साथी में आपके लिए नई सूचना है। निजी विवरण देखने के लिए लॉगिन करें: ${link}`
      : `You have a Sehat Saathi update. Sign in to view private details: ${link}`;
    if (channel === "EMAIL") {
      if (!this.capabilities().email || !recipient.email) return { status: "UNAVAILABLE", providerId: null };
      const result = await this.mail.send({ to: recipient.email, subject: hi ? "सेहत साथी — सूचना" : "Sehat Saathi — update", text, html: `<p>${text}</p>` });
      return { status: (result as { skipped?: boolean })?.skipped ? "UNAVAILABLE" : "ACCEPTED", providerId: null };
    }
    if (!this.capabilities().whatsapp || !recipient.phone) return { status: "UNAVAILABLE", providerId: null };
    const env = process.env;
    const response = await fetch(`https://graph.facebook.com/${env.SEHAT_WA_VERSION}/${env.SEHAT_WA_PHONE_ID}/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${env.SEHAT_WA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `91${recipient.phone}`,
        type: "template",
        template: {
          name: hi ? env.SEHAT_WA_TEMPLATE_HI : env.SEHAT_WA_TEMPLATE_EN,
          language: { code: hi ? env.SEHAT_WA_LANGUAGE_HI || "hi" : env.SEHAT_WA_LANGUAGE_EN || "en_US" },
        },
      }),
    });
    const body = (await response.json()) as { messages?: { id: string }[] };
    if (!response.ok || !body.messages?.[0]?.id) throw new Error("WHATSAPP_PROVIDER_REJECTED");
    return { status: "ACCEPTED", providerId: body.messages[0].id };
  }
}
