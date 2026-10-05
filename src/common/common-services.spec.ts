import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import { AppConfigService } from "../config/app-config.service.js";
import type { EnvironmentVariables } from "../config/env.validation.js";
import { validateEnv } from "../config/env.validation.js";
import type { DatabaseService } from "../database/database.service.js";
import { as, fakeConfig, rejectsWith, request, user } from "../testing/fakes.js";
import { MailService } from "./mail/mail.service.js";
import { RecaptchaService } from "./recaptcha/recaptcha.service.js";
import { bearerToken, SessionService } from "./session/session.service.js";

afterEach(() => mock.restoreAll());

describe("SessionService", () => {
  const sessions = (row: unknown) => {
    const first = mock.fn(async (..._args: unknown[]) => row);
    return { first, service: new SessionService(as<DatabaseService>({ first })) };
  };

  test("reads the token after an optional Bearer prefix", () => {
    assert.equal(bearerToken(request({ authorization: "Bearer abc" })), "abc");
    assert.equal(bearerToken(request({ authorization: "bearer   abc" })), "abc");
    assert.equal(bearerToken(request({ authorization: "abc" })), "abc");
    assert.equal(bearerToken(request()), undefined);
  });
  test("no token means no user, without a query", async () => {
    const { first, service } = sessions(user());
    assert.equal(await service.getBearerUser(request()), null);
    assert.equal(first.mock.callCount(), 0);
  });
  test("looks up live sessions by token", async () => {
    const { first, service } = sessions(user());
    assert.equal((await service.getBearerUser(request({ authorization: "Bearer t" })))?.id, "u-1");
    assert.deepEqual(first.mock.calls[0].arguments[1], ["t"]);
    assert.equal(await sessions(undefined).service.getBearerUser(request({ authorization: "Bearer t" })), null);
  });
  test("requireUser / requireAdmin", async () => {
    const auth = request({ authorization: "Bearer t" });
    await rejectsWith(sessions(undefined).service.requireUser(auth), 401, "Authentication required.");
    await rejectsWith(sessions(user()).service.requireAdmin(auth), 403, "Admin access required.");
    assert.equal((await sessions(user({ role: "admin" })).service.requireAdmin(auth)).role, "admin");
  });
});

describe("RecaptchaService", () => {
  const reply = (body: unknown) => mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body)));

  test("not configured: everyone passes", async () => {
    assert.equal(await new RecaptchaService(fakeConfig({ recaptchaSecret: undefined })).verify(undefined), true);
  });
  test("configured: missing token fails without calling Google", async () => {
    const fetch = reply({ success: true });
    assert.equal(await new RecaptchaService(fakeConfig({ recaptchaSecret: "s" })).verify(""), false);
    assert.equal(await new RecaptchaService(fakeConfig({ recaptchaSecret: "s" })).verify(42), false);
    assert.equal(fetch.mock.callCount(), 0);
  });
  test("passes on success with a good (or no) score", async () => {
    const service = new RecaptchaService(fakeConfig({ recaptchaSecret: "s" }));
    reply({ success: true, score: 0.9 });
    assert.equal(await service.verify("t"), true);
    mock.restoreAll();
    reply({ success: true });
    assert.equal(await service.verify("t"), true);
  });
  test("fails on low scores, unsuccessful checks and network errors", async () => {
    const service = new RecaptchaService(fakeConfig({ recaptchaSecret: "s" }));
    reply({ success: true, score: 0.1 });
    assert.equal(await service.verify("t"), false);
    mock.restoreAll();
    reply({ success: false });
    assert.equal(await service.verify("t"), false);
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => {
      throw new Error("offline");
    });
    const error = mock.method(console, "error", () => undefined);
    assert.equal(await service.verify("t"), false);
    assert.match(String(error.mock.calls[0].arguments[0]), /recaptcha/);
  });
});

describe("MailService", () => {
  test("skips with a warning when SMTP is not configured", async () => {
    const warn = mock.method(console, "warn", () => undefined);
    const service = new MailService(fakeConfig({ smtp: { host: undefined, port: 587, secure: false, user: undefined, pass: undefined, from: undefined } }));
    assert.equal(service.isConfigured(), false);
    assert.deepEqual(await service.send({ to: "a@x.com", subject: "S", html: "h", text: "t" }), { skipped: true });
    assert.match(String(warn.mock.calls[0].arguments[0]), /SMTP not configured — skipping email to a@x.com: S/);
  });
  test("builds a transport when SMTP is configured", () => {
    const service = new MailService(fakeConfig({ smtp: { host: "smtp.example.com", port: 465, secure: true, user: "u", pass: "p", from: "f" } }));
    assert.equal(service.isConfigured(), true);
  });
});

describe("AppConfigService", () => {
  const configFrom = (env: Partial<EnvironmentVariables>) =>
    new AppConfigService(as<ConfigService<EnvironmentVariables, true>>({ get: (key: keyof EnvironmentVariables) => env[key] }));

  test("legacy defaults", () => {
    const config = configFrom({});
    const original = { ...process.env };
    for (const key of [
      "API_PORT",
      "FRONTEND_URL",
      "ADMIN_NOTIFICATION_EMAILS",
      "TRUST_PROXY",
      "APP_ENV",
      "MYSQL_DATABASE",
      "MYSQL_USER",
      "MYSQL_PASSWORD",
      "MYSQL_HOST",
      "MYSQL_PORT",
      "SMTP_PORT",
      "UPLOADS_DIR",
    ])
      delete process.env[key];
    try {
      assert.equal(config.port, 4000);
      assert.equal(config.frontendUrl, "http://localhost:5173");
      assert.deepEqual(config.adminEmails, ["info@npsindore.org", "npsindor@gmail.com"]);
      assert.equal(config.trustProxy, 1);
      assert.equal(config.appEnv, "development");
      assert.deepEqual(config.database, { name: "patidar_samaj", user: "root", password: "cdn123", host: "localhost", port: 3306 });
      assert.equal(config.smtp.port, 587);
      assert.equal(config.smtp.secure, false);
      assert.match(config.uploadsDir, /uploads$/);
    } finally {
      Object.assign(process.env, original);
    }
  });
  test("parses configured values", () => {
    const config = configFrom({
      API_PORT: "5000",
      FRONTEND_URL: "https://x.org///",
      ADMIN_NOTIFICATION_EMAILS: " a@x.com, ,b@x.com ",
      TRUST_PROXY: "loopback",
      SMTP_PORT: "465",
      SMTP_USER: "u",
      UPLOADS_DIR: "/tmp/up",
    });
    assert.equal(config.port, 5000);
    assert.equal(config.frontendUrl, "https://x.org");
    assert.deepEqual(config.adminEmails, ["a@x.com", "b@x.com"]);
    assert.equal(config.trustProxy, "loopback");
    assert.deepEqual([config.smtp.port, config.smtp.secure, config.smtp.from], [465, true, "u"]);
    assert.equal(config.uploadsDir, "/tmp/up");
    assert.equal(configFrom({ TRUST_PROXY: "2" }).trustProxy, 2);
  });
  test("env validation rejects non-numeric ports", () => {
    assert.ok(validateEnv({ API_PORT: "4000", MYSQL_PORT: "" }));
    assert.throws(() => validateEnv({ API_PORT: "abc" }), /API_PORT must be a number/);
  });
});
