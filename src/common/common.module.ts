import { Global, Module } from "@nestjs/common";
import { MailService } from "./mail/mail.service.js";
import { RecaptchaService } from "./recaptcha/recaptcha.service.js";
import { SessionService } from "./session/session.service.js";

// Cross-cutting services shared by every feature module.
@Global()
@Module({
  providers: [MailService, RecaptchaService, SessionService],
  exports: [MailService, RecaptchaService, SessionService],
})
export class CommonModule {}
