import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { AppConfigService } from "../../config/app-config.service.js";

// Network errors and SMTP 4xx replies are temporary; 5xx replies (e.g. "recipient
// domain is reserved") would fail again, so they are not retried.
const isTransient = (error: unknown): boolean => {
  const code = (error as { responseCode?: number }).responseCode;
  return code === undefined || (code >= 400 && code < 500);
};

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Same behavior as the legacy server/mailer.js: when SMTP is not fully
// configured, emails are skipped with a warning instead of failing.
@Injectable()
export class MailService {
  private readonly transporter: Transporter | null;
  // Waits before each retry of a transient failure (two retries by default).
  retryDelaysMs = [1000, 4000];
  private readonly from: string | undefined;

  constructor(config: AppConfigService) {
    const smtp = config.smtp;
    this.from = smtp.from;
    this.transporter =
      smtp.host && smtp.user && smtp.pass
        ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: { user: smtp.user, pass: smtp.pass } })
        : null;
  }

  isConfigured(): boolean {
    return Boolean(this.transporter);
  }

  async send({ to, subject, html, text }: MailMessage): Promise<unknown> {
    if (!this.transporter) {
      console.warn(`[mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
      return { skipped: true };
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.transporter.sendMail({ from: this.from, to, subject, html, text });
      } catch (error) {
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined || !isTransient(error)) throw error;
        console.warn(`[mailer] send to ${to} failed (${error instanceof Error ? error.message : error}); retrying in ${delay} ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
