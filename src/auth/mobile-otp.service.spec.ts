import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { MailService } from "../common/mail/mail.service.js";
import type { MessagingService } from "../common/messaging/messaging.service.js";
import type { AppConfigService } from "../config/app-config.service.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { MobileOtpService, OTP_CHECK_UNAVAILABLE, OTP_INVALID } from "./mobile-otp.service.js";
import type { OtpChallengesRepository } from "./otp-challenges.repository.js";

type Challenge = { id: string; codeHash: string; providerRequestId: string | null; attempts: number; verifiedAt: Date | null; expiresAt: Date };
const build = ({
  provider = "WHATSAPP" as string | null,
  mailWorks = true,
  widgetRequestId = null as string | null,
  widgetCheck = true as boolean | null,
  pending = null as Challenge | null,
} = {}) => {
  const challenges = {
    latest: mock.fn(async () => pending),
    countSince: mock.fn(async () => 0),
    create: mock.fn(async (_data: { codeHash: string; providerRequestId?: string | null; channel: string }) => ({})),
    addAttempt: mock.fn(async () => undefined),
    markVerified: mock.fn(async () => undefined),
  };
  const messaging = {
    sendOtp: mock.fn(async () => provider),
    sendWidgetOtp: mock.fn(async (_mobile: string) => widgetRequestId),
    verifyWidgetOtp: mock.fn(async (_requestId: string, _code: string) => widgetCheck),
  };
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
  return { service, mail, challenges, messaging };
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

describe("MobileOtpService with MSG91's OTP widget (SMS without our own DLT)", () => {
  const widgetChallenge = (): Challenge => ({
    id: "c1",
    codeHash: "never-matches",
    providerRequestId: "req-1",
    attempts: 0,
    verifiedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  });

  test("no WhatsApp / DLT flow: the widget sends the SMS, its request id is kept and nothing is emailed", async () => {
    const { service, mail, challenges, messaging } = build({ provider: null, widgetRequestId: "req-1" });
    const result = await service.send("9876543210", "RESET", "member@example.com");
    assert.equal(result.channel, "SMS");
    assert.equal(messaging.sendWidgetOtp.mock.calls[0].arguments[0], "9876543210");
    const saved = challenges.create.mock.calls[0].arguments[0];
    assert.equal(saved.providerRequestId, "req-1");
    assert.equal(saved.channel, "SMS");
    assert.equal(mail.send.mock.callCount(), 0);
  });
  test("WhatsApp / DLT flow delivered: the widget is not used", async () => {
    const { service, messaging, challenges } = build({ provider: "SMS", widgetRequestId: "req-1" });
    await service.send("9876543210", "REGISTER");
    assert.equal(messaging.sendWidgetOtp.mock.callCount(), 0);
    assert.equal(challenges.create.mock.calls[0].arguments[0].providerRequestId, null);
  });
  test("the widget fails too: the code goes by email", async () => {
    const { service, mail } = build({ provider: null, widgetRequestId: null });
    const result = await service.send("9876543210", "RESET", "member@example.com");
    assert.equal(result.channel, "EMAIL");
    assert.equal(mail.send.mock.callCount(), 1);
  });
  test("a widget code is checked by MSG91 and a right one gives a verification token", async () => {
    const { service, messaging, challenges } = build({ pending: widgetChallenge(), widgetCheck: true });
    const token = await service.verify("9876543210", "RESET", "123456");
    assert.ok(token);
    assert.deepEqual(messaging.verifyWidgetOtp.mock.calls[0].arguments, ["req-1", "123456"]);
    assert.equal(challenges.markVerified.mock.callCount(), 1);
  });
  test("a wrong widget code counts as a failed attempt", async () => {
    const { service, challenges } = build({ pending: widgetChallenge(), widgetCheck: false });
    await rejectsWith(service.verify("9876543210", "RESET", "123456"), 400, OTP_INVALID);
    assert.equal(challenges.addAttempt.mock.callCount(), 1);
    assert.equal(challenges.markVerified.mock.callCount(), 0);
  });
  test("MSG91 unreachable while checking: 503 and no attempt counted against the user", async () => {
    const { service, challenges } = build({ pending: widgetChallenge(), widgetCheck: null });
    await rejectsWith(service.verify("9876543210", "RESET", "123456"), 503, OTP_CHECK_UNAVAILABLE);
    assert.equal(challenges.addAttempt.mock.callCount(), 0);
  });
});
