import { Injectable } from "@nestjs/common";
import { AppConfigService } from "../../config/app-config.service.js";
import { type Lang, type NotificationKey, notificationText } from "../../notifications/notification-texts.js";
import { statusUpdateEmail } from "../mail/email-templates.js";
import { MailService } from "../mail/mail.service.js";
import { normalizeMobile } from "../utils/text.js";
import { MessagingService } from "./messaging.service.js";

export interface Outbound {
  key: NotificationKey;
  vars: Record<string, string | null | undefined>;
  lang: Lang;
  name: string;
  email: string | null | undefined;
  mobile: string | null | undefined;
}

// Email and WhatsApp copies of an applicant's in-app notification. Sent after the database commit,
// best effort: a delivery failure is logged and never undoes the decision that caused it.
@Injectable()
export class ApplicantNotifier {
  constructor(
    private readonly mail: MailService,
    private readonly messaging: MessagingService,
    private readonly config: AppConfigService,
  ) {}

  async deliver(messages: Outbound[]): Promise<void> {
    for (const message of messages) {
      const { title, message: text } = notificationText(message.key, message.vars, message.lang);
      if (message.email) {
        const email = statusUpdateEmail({ name: message.name, title, message: text, loginUrl: `${this.config.frontendUrl}/login` });
        await this.mail
          .send({ to: message.email, subject: email.subject, html: email.html, text: email.text })
          .catch((error: unknown) => console.error("[mailer] status email failed:", error instanceof Error ? error.message : error));
      }
      await this.messaging.sendNotice(normalizeMobile(message.mobile), `${title}: ${text}`);
    }
  }
}
