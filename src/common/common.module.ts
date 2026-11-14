import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail/mail.service.js";
import { ApplicantNotifier } from "./messaging/applicant-notifier.service.js";
import { MessagingService } from "./messaging/messaging.service.js";
import { RecaptchaService } from "./recaptcha/recaptcha.service.js";
import { SessionService } from "./session/session.service.js";

// Cross-cutting services shared by every feature module.
@Global()
@Module({
  providers: [ApplicantNotifier, MailService, MessagingService, RecaptchaService, SessionService],
  exports: [ApplicantNotifier, MailService, MessagingService, RecaptchaService, SessionService],
})
export class CommonModule {}
