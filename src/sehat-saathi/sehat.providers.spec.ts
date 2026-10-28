import assert from "node:assert/strict";
import { test } from "node:test";
import type { MailMessage, MailService } from "../common/mail/mail.service.js";
import type { AppConfigService } from "../config/app-config.service.js";
import { SehatProviders } from "./sehat.providers.js";

test("WhatsApp is disabled unless authorized and fully configured; no credentials are exposed", () => {
  const before = process.env.SEHAT_WHATSAPP_AUTHORIZED;
  process.env.SEHAT_WHATSAPP_AUTHORIZED = "false";
  try {
    const provider = new SehatProviders({ isConfigured: () => false } as MailService, { frontendUrl: "https://example.invalid" } as AppConfigService);
    assert.deepEqual(provider.capabilities(), { email: false, whatsapp: false, inApp: true });
  } finally {
    if (before === undefined) delete process.env.SEHAT_WHATSAPP_AUTHORIZED;
    else process.env.SEHAT_WHATSAPP_AUTHORIZED = before;
  }
});
test("email notices contain no medicine or member contact and provider acceptance is explicit", async () => {
  let message: MailMessage = { to: "", subject: "", text: "", html: "" };
  const provider = new SehatProviders(
    {
      isConfigured: () => true,
      send: async (value: MailMessage) => {
        message = value;
        return {};
      },
    } as unknown as MailService,
    { frontendUrl: "https://example.invalid" } as AppConfigService,
  );
  assert.equal((await provider.send("EMAIL", { email: "test@example.invalid", phone: null, lang: "hi" })).status, "ACCEPTED");
  assert.ok(message.text.includes("सेहत साथी"));
  assert.ok(message.text.includes("https://example.invalid/medical"));
  assert.equal(message.text.includes("test@example.invalid"), false);
});
test("Meta integration uses an authorized approved template and never embeds medical details", async () => {
  const keys = ["SEHAT_WHATSAPP_AUTHORIZED", "SEHAT_WA_TOKEN", "SEHAT_WA_PHONE_ID", "SEHAT_WA_VERSION", "SEHAT_WA_TEMPLATE_EN", "SEHAT_WA_TEMPLATE_HI"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const original = globalThis.fetch;
  Object.assign(process.env, {
    SEHAT_WHATSAPP_AUTHORIZED: "true",
    SEHAT_WA_TOKEN: "test-token",
    SEHAT_WA_PHONE_ID: "12345",
    SEHAT_WA_VERSION: "v23.0",
    SEHAT_WA_TEMPLATE_EN: "approved_en",
    SEHAT_WA_TEMPLATE_HI: "approved_hi",
  });
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_input, options) => {
    sent = JSON.parse(String(options?.body));
    return new Response(JSON.stringify({ messages: [{ id: "provider-id" }] }), { status: 200 });
  };
  try {
    const provider = new SehatProviders({ isConfigured: () => false } as MailService, { frontendUrl: "https://example.invalid" } as AppConfigService);
    assert.equal(provider.capabilities().whatsapp, true);
    assert.deepEqual(await provider.send("WHATSAPP", { email: null, phone: "9000000000", lang: "hi" }), { status: "ACCEPTED", providerId: "provider-id" });
    assert.deepEqual(sent, {
      messaging_product: "whatsapp",
      to: "919000000000",
      type: "template",
      template: { name: "approved_hi", language: { code: "hi" } },
    });
    globalThis.fetch = async () => new Response("{}", { status: 400 });
    await assert.rejects(() => provider.send("WHATSAPP", { email: null, phone: "9000000000", lang: "hi" }), /WHATSAPP_PROVIDER_REJECTED/);
  } finally {
    globalThis.fetch = original;
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
