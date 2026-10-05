import { Injectable } from "@nestjs/common";
import nodemailer, { type Transporter } from "nodemailer";
import { AppConfigService } from "../../config/app-config.service.js";

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
    return this.transporter.sendMail({ from: this.from, to, subject, html, text });
  }
}
