// Shared fakes for unit tests: services are constructed directly with these
// in place of their repositories and collaborators (no Nest container, no DB).
import assert from "node:assert/strict";
import { mock } from "node:test";
import type { Request } from "express";
import type { MailService } from "../common/mail/mail.service.js";
import type { RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { SessionService, UserRow } from "../common/session/session.service.js";
import type { AppConfigService } from "../config/app-config.service.js";

// Narrow a fake to the type a constructor expects; fakes only implement what a test uses.
export const as = <T>(fake: object): T => fake as unknown as T;

export const fakeConfig = (overrides: Partial<Record<keyof AppConfigService, unknown>> = {}): AppConfigService =>
  as<AppConfigService>({
    frontendUrl: "https://npsindore.org",
    adminEmails: ["admin@npsindore.org", "info@npsindore.org"],
    appEnv: "test",
    recaptchaSecret: undefined,
    ...overrides,
  });

export const fakeMail = () => {
  const send = mock.fn(async (_message: unknown) => ({ skipped: true }));
  return { send, service: as<MailService>({ send }) };
};

export const fakeRecaptcha = (passes = true) => {
  const verify = mock.fn(async (_token: unknown) => passes);
  return { verify, service: as<RecaptchaService>({ verify }) };
};

export const user = (overrides: Partial<UserRow> = {}): UserRow => ({
  id: "u-1",
  email: "member@example.com",
  full_name: "Member",
  phone: "9876543210",
  role: "user",
  password_hash: null,
  is_verified: 1,
  ...overrides,
});
export const admin = (overrides: Partial<UserRow> = {}): UserRow => user({ id: "u-admin", email: "admin@example.com", role: "admin", ...overrides });

// SessionService stand-in: `current` is who the request is logged in as (null = anonymous).
export const fakeSessions = (current: UserRow | null) =>
  as<SessionService>({
    getBearerUser: async () => current,
    requireUser: async () => {
      if (!current) throw apiError(401, "Authentication required.");
      return current;
    },
    requireAdmin: async () => {
      if (!current) throw apiError(401, "Authentication required.");
      if (current.role !== "admin") throw apiError(403, "Admin access required.");
      return current;
    },
  });

const apiError = (status: number, error: string) => Object.assign(new Error(error), { getStatus: () => status, getResponse: () => ({ error }) });

export const request = (headers: Record<string, string> = {}): Request =>
  as<Request>({ headers, protocol: "https", get: (name: string) => (name === "host" ? "api.npsindore.org" : undefined) });

// Assert that a promise rejects with the API's `{ error }` body and status.
export const rejectsWith = async (promise: Promise<unknown>, status: number, message: string | RegExp): Promise<void> => {
  await assert.rejects(promise, (error: unknown) => {
    const e = error as { getStatus?: () => number; getResponse?: () => { error?: string } };
    assert.equal(e.getStatus?.(), status, `expected status ${status}`);
    const text = e.getResponse?.().error ?? "";
    if (message instanceof RegExp) assert.match(text, message);
    else assert.equal(text, message);
    return true;
  });
};

// Let fire-and-forget work (emails sent after responding) finish.
export const flush = () => new Promise((resolve) => setImmediate(resolve));
