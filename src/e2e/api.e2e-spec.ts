// End-to-end tests of every /api/v1 endpoint through the real Nest app
// (guards, pipes, interceptors, filters, rate-limit wiring) and a real
// database. Each endpoint covers success plus its validation, not-found and
// auth failures where they apply.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { ENTITY_DEFINITIONS, ENTITY_NAMES } from "../modules/entities/entity-definitions.js";
import { api, FAMILY, OTP, PASSWORD, startApp, stopApp, TOKENS } from "../testing/e2e-app.js";

const V1 = "/api/v1";
const AUTH_REQUIRED = { error: "Authentication required." };
const ADMIN_REQUIRED = { error: "Admin access required." };
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

before(startApp, { timeout: 120_000 });
after(stopApp);

describe("platform", () => {
  test("GET /health", async () => {
    const res = await api("get", `${V1}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, database: "mysql", env: "e2e" });
  });
  test("unknown routes are 404 with the error format", async () => {
    const res = await api("get", `${V1}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: "Cannot GET /api/v1/nope" });
  });
  test("old /api paths are gone", async () => {
    assert.equal((await api("get", "/api/health")).status, 404);
  });
  test("malformed JSON is a 400 with the error format", async () => {
    const res = await api("post", `${V1}/auth/sessions`).set("Content-Type", "application/json").send("{bad");
    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, "string");
  });
  test("Swagger UI and document are served at /api/docs", async () => {
    assert.equal((await api("get", "/api/docs")).status, 200);
    const doc = await api("get", "/api/docs-json");
    assert.equal(doc.status, 200);
    assert.ok(doc.body.paths["/api/v1/auth/sessions"]);
  });
});

describe("auth", () => {
  test("POST /auth/registrations", async () => {
    assert.deepEqual((await api("post", `${V1}/auth/registrations`).send({ email: "x@e2e.local", phone: "9811111111" })).body, {
      error: "Email and password are required; password must be at least 6 characters.",
    });
    assert.equal((await api("post", `${V1}/auth/registrations`).send({ email: "x@e2e.local", password: "secret1", phone: "9100000002" })).status, 409);
    const res = await api("post", `${V1}/auth/registrations`).send({
      email: "New@E2E.local",
      password: "secret1",
      phone: "9811111111",
      unknownField: "dropped",
    });
    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body).sort(), ["requiresOtp", "user"]);
    assert.equal(res.body.user.email, "new@e2e.local");
  });
  test("POST /auth/otp-verifications", async () => {
    assert.equal((await api("post", `${V1}/auth/otp-verifications`).send({ email: "otp@e2e.local", otpCode: "1" })).status, 400);
    assert.deepEqual((await api("post", `${V1}/auth/otp-verifications`).send({ email: "ghost@e2e.local", otpCode: "111111" })).body, {
      error: "Account not found.",
    });
    const res = await api("post", `${V1}/auth/otp-verifications`).send({ email: "otp@e2e.local", otpCode: OTP });
    assert.equal(res.status, 200);
    assert.match(res.body.access_token, /^[0-9a-f]{64}$/);
  });
  test("POST /auth/otps", async () => {
    assert.equal((await api("post", `${V1}/auth/otps`).send({})).status, 400);
    const res = await api("post", `${V1}/auth/otps`).send({ email: "ghost@e2e.local" });
    assert.deepEqual([res.status, res.body], [200, { ok: true }]);
  });
  test("POST /auth/sessions and DELETE /auth/sessions/current", async () => {
    assert.deepEqual((await api("post", `${V1}/auth/sessions`).send({ email: "otp@e2e.local", password: "wrong" })).body, {
      error: "Invalid email/phone or password.",
    });
    const login = await api("post", `${V1}/auth/sessions`).send({ email: "otp@e2e.local", password: PASSWORD });
    assert.equal(login.status, 200);
    const token = login.body.access_token as string;
    assert.equal((await api("get", `${V1}/auth/me`, token)).status, 200);
    const logout = await api("delete", `${V1}/auth/sessions/current`, token);
    assert.equal(logout.status, 204);
    assert.equal((await api("get", `${V1}/auth/me`, token)).status, 401);
    assert.equal((await api("post", `${V1}/auth/sessions/current`, token)).status, 404, "logout is DELETE only");
  });
  test("POST /auth/password-resets and /confirmations", async () => {
    assert.equal((await api("post", `${V1}/auth/password-resets`).send({})).status, 400);
    assert.deepEqual((await api("post", `${V1}/auth/password-resets`).send({ email: "member@e2e.local" })).body, { ok: true });
    assert.deepEqual((await api("post", `${V1}/auth/password-resets/confirmations`).send({ resetToken: "nope", newPassword: "123456" })).body, {
      error: "This reset link is invalid or expired.",
    });
  });
  test("POST /auth/invitations", async () => {
    assert.deepEqual((await api("post", `${V1}/auth/invitations`).send({ email: "i@e2e.local" })).body, AUTH_REQUIRED);
    assert.deepEqual((await api("post", `${V1}/auth/invitations`, TOKENS.member).send({ email: "i@e2e.local" })).body, ADMIN_REQUIRED);
    assert.equal((await api("post", `${V1}/auth/invitations`, TOKENS.admin).send({})).status, 400);
    const res = await api("post", `${V1}/auth/invitations`, TOKENS.admin).send({ email: "invitee@e2e.local" });
    assert.equal(res.status, 201);
    assert.equal(res.body.username, "invitee@e2e.local");
  });
  test("PUT /auth/password", async () => {
    assert.deepEqual((await api("put", `${V1}/auth/password`).send({})).body, AUTH_REQUIRED);
    assert.equal((await api("put", `${V1}/auth/password`, TOKENS.noFamily).send({ currentPassword: PASSWORD, newPassword: "1" })).status, 400);
    assert.equal((await api("put", `${V1}/auth/password`, TOKENS.noFamily).send({ currentPassword: "x", newPassword: "123456" })).status, 401);
    assert.deepEqual((await api("put", `${V1}/auth/password`, TOKENS.noFamily).send({ currentPassword: PASSWORD, newPassword: PASSWORD })).body, { ok: true });
  });
  test("GET /auth/me", async () => {
    assert.deepEqual((await api("get", `${V1}/auth/me`)).body, AUTH_REQUIRED);
    assert.deepEqual((await api("get", `${V1}/auth/me`, TOKENS.member)).body, {
      id: "u-member",
      email: "member@e2e.local",
      full_name: "Member",
      phone: "9100000002",
      role: "user",
    });
  });
});

describe("me", () => {
  test("GET /me/family", async () => {
    assert.deepEqual((await api("get", `${V1}/me/family`)).body, AUTH_REQUIRED);
    const res = await api("get", `${V1}/me/family`, TOKENS.member);
    assert.equal(res.body.family.family_id, FAMILY);
    assert.equal(res.body.members.length, 1);
  });
  test("GET /me/feedback", async () => {
    assert.deepEqual((await api("get", `${V1}/me/feedback`)).body, AUTH_REQUIRED);
    assert.deepEqual((await api("get", `${V1}/me/feedback`, TOKENS.member)).body, []);
  });
});

describe("public lookups", () => {
  test("GET /family-verifications/:familyId", async () => {
    const res = await api("get", `${V1}/family-verifications/${FAMILY}`);
    assert.equal(res.body.family.family_id, FAMILY);
    assert.equal((await api("get", `${V1}/family-verifications/NPSI-FAM-999999`)).status, 404);
  });
  test("GET /application-status", async () => {
    assert.equal((await api("get", `${V1}/application-status`)).status, 400);
    assert.equal((await api("get", `${V1}/application-status?applicationId=NPSI-APP-2026-000001&mobile=1`)).status, 404);
    const res = await api("get", `${V1}/application-status?applicationId=NPSI-APP-2026-000001&mobile=9400000001`);
    assert.equal(res.body.application_id, "NPSI-APP-2026-000001");
  });
  test("GET /mobile-availability and /email-availability", async () => {
    assert.deepEqual((await api("get", `${V1}/mobile-availability?mobile=9300000001`)).body, { taken: true });
    assert.deepEqual((await api("get", `${V1}/mobile-availability`)).body, { taken: false });
    assert.deepEqual((await api("get", `${V1}/email-availability?email=MEMBER@e2e.local`)).body, { taken: true });
    assert.deepEqual((await api("get", `${V1}/email-availability?email=free@e2e.local`)).body, { taken: false });
  });
  test("GET /stats", async () => {
    assert.deepEqual((await api("get", `${V1}/stats`)).body, { families: 1, members: 1 });
  });
  test("public lookups are rate limited per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await api("get", `${V1}/family-verifications/${FAMILY}`).set("X-Forwarded-For", "10.9.9.9")).status);
    assert.equal(statuses.at(-1), 429);
  });
});

describe("uploads", () => {
  test("POST /uploads", async () => {
    assert.deepEqual((await api("post", `${V1}/uploads`)).body, { error: "No file uploaded." });
    assert.equal((await api("post", `${V1}/uploads`).attach("file", Buffer.from("x"), { filename: "a.txt", contentType: "text/plain" })).status, 400);
    const res = await api("post", `${V1}/uploads`).attach("file", PNG, { filename: "a.png", contentType: "image/png" });
    assert.equal(res.status, 201);
    const path = new URL(res.body.file_url).pathname;
    assert.match(path, /^\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal((await api("get", path)).status, 200);
  });
});

describe("entity resources", () => {
  test("every resource lists for admins and rejects anonymous admin-only reads", async () => {
    for (const name of ENTITY_NAMES) {
      const { resource } = ENTITY_DEFINITIONS[name];
      const res = await api("get", `${V1}/${resource}`, TOKENS.admin);
      assert.equal(res.status, 200, resource);
      if (["events", "announcements", "rules", "principles"].includes(resource)) assert.equal((await api("get", `${V1}/${resource}`)).status, 200, resource);
      else assert.equal((await api("get", `${V1}/${resource}`)).status, 401, resource);
    }
  });
  test("GET with filter/order/limit", async () => {
    const res = await api("get", `${V1}/events?filter=${encodeURIComponent('{"title":"Event"}')}&order=title&limit=5`);
    assert.deepEqual(
      res.body.map((e: { id: string }) => e.id),
      ["ev-1"],
    );
  });
  test("POST /families: auth, ownership, sequential ids, field whitelist", async () => {
    assert.deepEqual((await api("post", `${V1}/families`).send({})).body, AUTH_REQUIRED);
    assert.deepEqual((await api("post", `${V1}/families`, TOKENS.member).send({})).body, ADMIN_REQUIRED);
    const res = await api("post", `${V1}/families`, TOKENS.admin).send({ family_name: "New", notAColumn: "dropped" });
    assert.equal(res.status, 201);
    assert.equal(res.body.family_id, "NPSI-FAM-000002");
    assert.ok(!("notAColumn" in res.body));
  });
  test("POST /family-members accepts camelCase field names", async () => {
    const res = await api("post", `${V1}/family-members`, TOKENS.member).send({ familyId: FAMILY, name: "Kid", relationship: "Son" });
    assert.equal(res.status, 403, "member's family_id check uses the snake_case field");
    const ok = await api("post", `${V1}/family-members`, TOKENS.admin).send({ familyId: FAMILY, name: "Kid", relationship: "Son" });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.family_id, FAMILY);
  });
  test("POST /applications: validation and duplicate checks", async () => {
    assert.deepEqual((await api("post", `${V1}/applications`).send({ mobile: "1" })).body, { error: "A valid 10-digit mobile number is required." });
    const valid = { family_head_name: "H", mobile: "9876500001", family_name: "F", email: "f@e2e.local", address: "A", city: "C", district: "D" };
    assert.equal((await api("post", `${V1}/applications`).send({ ...valid, mobile: "9300000001" })).status, 409);
    const res = await api("post", `${V1}/applications`).send({ ...valid, recaptchaToken: "t" });
    assert.equal(res.status, 201);
    assert.ok(!("recaptchaToken" in res.body));
  });
  test("POST /:resource/batch", async () => {
    assert.deepEqual((await api("post", `${V1}/samitis/batch`).send({ records: [] })).body, AUTH_REQUIRED);
    assert.deepEqual((await api("post", `${V1}/samitis/batch`, TOKENS.member).send({ records: [] })).body, ADMIN_REQUIRED);
    const empty = await api("post", `${V1}/samitis/batch`, TOKENS.admin).send({ records: [] });
    assert.deepEqual([empty.status, empty.body], [200, []]);
    const res = await api("post", `${V1}/samitis/batch`, TOKENS.admin).send({ records: [{ name: "A" }, { name: "B" }] });
    assert.equal(res.status, 201);
    assert.deepEqual(
      res.body.map((s: { name: string }) => s.name),
      ["A", "B"],
    );
  });
  test("PATCH /:resource/:id", async () => {
    assert.deepEqual((await api("patch", `${V1}/events/ev-1`).send({ title: "X" })).body, AUTH_REQUIRED);
    assert.deepEqual((await api("patch", `${V1}/events/ev-1`, TOKENS.member).send({ title: "X" })).body, ADMIN_REQUIRED);
    assert.deepEqual((await api("patch", `${V1}/events/missing`, TOKENS.admin).send({ title: "X" })).body, { error: "Record not found" });
    const res = await api("patch", `${V1}/events/ev-1`, TOKENS.admin).send({ title: "Renamed" });
    assert.equal(res.body.title, "Renamed");
    assert.deepEqual((await api("patch", `${V1}/family-members/fm-1`, TOKENS.noFamily).send({ name: "X" })).body, {
      error: "No family found for your account.",
    });
  });
  test("DELETE /:resource/:id", async () => {
    assert.deepEqual((await api("delete", `${V1}/events/ev-1`)).body, AUTH_REQUIRED);
    assert.deepEqual((await api("delete", `${V1}/events/ev-1`, TOKENS.member)).body, ADMIN_REQUIRED);
    const res = await api("delete", `${V1}/events/ev-1`, TOKENS.admin);
    assert.deepEqual([res.status, res.text], [204, ""]);
    assert.deepEqual((await api("get", `${V1}/events`)).body, []);
  });
});
