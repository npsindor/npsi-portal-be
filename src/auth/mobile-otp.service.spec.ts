import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { MailService } from "../common/mail/mail.service.js";
import type { MessagingService } from "../common/messaging/messaging.service.js";
import type { AppConfigService } from "../config/app-config.service.js";
import { as } from "../testing/fakes.js";
import { MobileOtpService } from "./mobile-otp.service.js";
import type { OtpChallengesRepository } from "./otp-challenges.repository.js";

const build = ({ provider = "WHATSAPP" as string | null, mailWorks = true } = {}) => {
  const challenges = { latest: mock.fn(async () => null), countSince: mock.fn(async () => 0), create: mock.fn(async () => ({})) };
  const messaging = { sendOtp: mock.fn(async () => provider) };
  const mail = {
    isConfigured: () => true,
    send: mock.fn(async (_message: { to: string }) => {
      if (!mailWorks) throw new Error("SMTP down");
      return {};
    }),
  };
  const service = new MobileOtpService(
    as<OtpChallengesRepository>(challenges),
    as<MessagingService>(messaging),
    as<MailService>(mail),
    as<AppConfigService>({ appEnv: "production" }),
  );
  return { service, mail, challenges };
};

describe("MobileOtpService delivery", () => {
  test("password reset: a code sent to the mobile is never also emailed (the email may be someone else's)", async () => {
    const { service, mail } = build();
    const result = await service.send("9876543210", "RESET", "member@example.com");
    assert.equal(result.channel, "WHATSAPP");
    assert.equal(mail.send.mock.callCount(), 0);
  });
  test("registration: no email copy when WhatsApp accepted (the mobile itself must be proven)", async () => {
    const { service, mail } = build();
    await service.send("9876543210", "REGISTER", "someone@example.com");
    assert.equal(mail.send.mock.callCount(), 0);
  });
  test("no WhatsApp / SMS: the code goes by email", async () => {
    const { service, mail } = build({ provider: null });
    const result = await service.send("9876543210", "RESET", "member@example.com");
    assert.equal(result.channel, "EMAIL");
    assert.equal(mail.send.mock.callCount(), 1);
  });
  test("a reset code sent by WhatsApp is recorded even when email is down", async () => {
    const { service, challenges } = build({ mailWorks: false });
    const result = await service.send("9876543210", "RESET", "member@example.com");
    assert.equal(result.channel, "WHATSAPP");
    assert.equal(challenges.create.mock.callCount(), 1);
  });
});
