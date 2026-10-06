import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, mock, test } from "node:test";
import type { ConfigService } from "@nestjs/config";
import { AppConfigService } from "../config/app-config.service.js";
import type { EnvironmentVariables } from "../config/env.validation.js";
import { validateEnv } from "../config/env.validation.js";
import type { PrismaService } from "../database/prisma.service.js";
import { as, fakeConfig, rejectsWith, request, user } from "../testing/fakes.js";
import { logServerError, type RequestWithId, requestLogger } from "./logging/request-logger.js";
import { MailService } from "./mail/mail.service.js";
import { RecaptchaService } from "./recaptcha/recaptcha.service.js";
import { bearerToken, SessionService } from "./session/session.service.js";
import { sha256 } from "./utils/crypto.js";

afterEach(() => mock.restoreAll());

describe("SessionService", () => {
  const sessions = (row: unknown) => {
    const first = mock.fn(async (_args: { where: { sessionToken: string; sessionExpiresAt: { gt: Date } } }) => row ?? null);
    return { first, service: new SessionService(as<PrismaService>({ user: { findFirst: first } })) };
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
    const { where } = first.mock.calls[0].arguments[0];
    assert.equal(where.sessionToken, sha256("t"), "looks up the token's hash");
    assert.ok(where.sessionExpiresAt.gt instanceof Date, "only unexpired sessions");
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
    // The sender falls back to SMTP_USER only when SMTP_FROM isn't set in the real environment.
    const smtpFrom = process.env.SMTP_FROM;
    delete process.env.SMTP_FROM;
    try {
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
    } finally {
      if (smtpFrom !== undefined) process.env.SMTP_FROM = smtpFrom;
    }
  });
  test("env validation rejects non-numeric ports", () => {
    assert.ok(validateEnv({ API_PORT: "4000", MYSQL_PORT: "" }));
    assert.throws(() => validateEnv({ API_PORT: "abc" }), /API_PORT must be a number/);
  });
});

describe("MailService retries", () => {
  const configured = () => {
    const service = new MailService(fakeConfig({ smtp: { host: "smtp.example.com", port: 465, secure: true, user: "u", pass: "p", from: "f" } }));
    service.retryDelaysMs = [0, 0];
    const sendMail = mock.fn(async (_message: unknown): Promise<unknown> => ({ messageId: "1" }));
    Object.defineProperty(service, "transporter", { value: { sendMail } });
    return { service, sendMail };
  };
  const message = { to: "a@x.com", subject: "S", html: "h", text: "t" };

  test("retries transient failures (network errors, SMTP 4xx) twice", async () => {
    const { service, sendMail } = configured();
    mock.method(console, "warn", () => undefined);
    sendMail.mock.mockImplementationOnce(async () => {
      throw new Error("ECONNRESET");
    });
    sendMail.mock.mockImplementationOnce(async () => {
      throw Object.assign(new Error("try later"), { responseCode: 421 });
    }, 1);
    assert.deepEqual(await service.send(message), { messageId: "1" });
    assert.equal(sendMail.mock.callCount(), 3);
  });
  test("gives up after the last retry", async () => {
    const { service, sendMail } = configured();
    mock.method(console, "warn", () => undefined);
    sendMail.mock.mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    });
    await assert.rejects(service.send(message), /ECONNREFUSED/);
    assert.equal(sendMail.mock.callCount(), 3);
  });
  test("permanent SMTP rejections (5xx) are not retried", async () => {
    const { service, sendMail } = configured();
    sendMail.mock.mockImplementation(async () => {
      throw Object.assign(new Error("554 reserved domain"), { responseCode: 554 });
    });
    await assert.rejects(service.send(message), /554/);
    assert.equal(sendMail.mock.callCount(), 1);
  });
});

describe("requestLogger", () => {
  const run = (headers: Record<string, string> = {}, url = "/api/v1/stats?email=secret@x.com") => {
    const listeners: Record<string, () => void> = {};
    const response = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      on(event: string, cb: () => void) {
        listeners[event] = cb;
      },
    };
    const req = { get: (name: string) => headers[name.toLowerCase()], method: "GET", originalUrl: url, ip: "1.2.3.4" } as unknown as RequestWithId;
    const next = mock.fn();
    requestLogger(req, response as never, next);
    return { req, response, next, finish: () => listeners.finish?.() };
  };

  // Logging is on unless LOG_REQUESTS=false, which CI sets to keep its output quiet.
  const logsOn = process.env.LOG_REQUESTS;
  beforeEach(() => {
    delete process.env.LOG_REQUESTS;
  });
  after(() => {
    if (logsOn === undefined) delete process.env.LOG_REQUESTS;
    else process.env.LOG_REQUESTS = logsOn;
  });

  test("assigns a request id, or keeps a sane incoming one", () => {
    const fresh = run();
    assert.match(fresh.response.headers["X-Request-Id"], /^[0-9a-f-]{36}$/);
    assert.equal(fresh.req.requestId, fresh.response.headers["X-Request-Id"]);
    assert.equal(run({ "x-request-id": "abc-123" }).response.headers["X-Request-Id"], "abc-123");
    assert.notEqual(run({ "x-request-id": "bad id <script>" }).response.headers["X-Request-Id"], "bad id <script>");
  });
  test("logs one JSON line per request, without the query string", () => {
    const log = mock.method(console, "log", () => undefined);
    const { finish, next } = run();
    assert.equal(next.mock.callCount(), 1);
    finish();
    const line = JSON.parse(String(log.mock.calls[0].arguments[0]));
    assert.deepEqual(
      { msg: line.msg, method: line.method, path: line.path, status: line.status, ip: line.ip },
      { msg: "request", method: "GET", path: "/api/v1/stats", status: 200, ip: "1.2.3.4" },
    );
    assert.ok(!String(log.mock.calls[0].arguments[0]).includes("secret@x.com"));
  });
  test("server errors are logged with the request id; client errors are not", () => {
    const error = mock.method(console, "error", () => undefined);
    const { req } = run();
    logServerError(req, 400, new Error("bad input"));
    assert.equal(error.mock.callCount(), 0);
    logServerError(req, 500, new Error("boom"));
    const line = JSON.parse(String(error.mock.calls[0].arguments[0]));
    assert.equal(line.id, req.requestId);
    assert.equal(line.message, "boom");
  });
});
