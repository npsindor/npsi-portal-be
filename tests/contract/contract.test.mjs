// Contract tests: the source of truth for "behavior must not change".
// Run with `npm run test:contract` (legacy app) or with CONTRACT_API=v1 and
// CONTRACT_SERVER_CMD set for the NestJS app. Tests run in order and share
// one seeded database, so later tests may depend on records created earlier.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { call, FAMILY1, FAMILY2, IDS, OTP_CODE, PASSWORDS, query, setup, TOKENS, teardown } from "./harness.mjs";
import { API, ENTITIES } from "./paths.mjs";

const api = (key, args = [], opts = {}) => {
  const [method, url] = API[key](...args);
  return call(method, url, opts);
};
const YEAR = new Date().getFullYear();
const PUBLIC_USER_KEYS = ["email", "full_name", "id", "phone", "role"];
const keys = (obj) => Object.keys(obj).sort();
const assertError = (res, status, message) => {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  if (message instanceof RegExp) assert.match(res.body.error, message);
  else assert.deepEqual(res.body, { error: message });
};
const assertRecord = (record) => {
  assert.ok(record.id, "record has id");
  assert.ok("created_date" in record && "updated_date" in record, "timestamps renamed to *_date");
  assert.ok(!("created_at" in record) && !("updated_at" in record), "raw timestamps not exposed");
};

before(setup, { timeout: 120000 });
after(teardown);

describe("health", () => {
  test("reports ok, database and environment", async () => {
    const res = await api("health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, database: "mysql", env: "contract" });
  });
});

describe("cross-cutting", () => {
  test("allowed CORS origin is reflected with credentials", async () => {
    const res = await api("health").set("Origin", "https://test.npsindore.org");
    assert.equal(res.headers["access-control-allow-origin"], "https://test.npsindore.org");
    assert.equal(res.headers["access-control-allow-credentials"], "true");
  });
  test("disallowed CORS origin is rejected with the error format", async () => {
    const res = await api("health").set("Origin", "https://evil.example.com");
    assertError(res, 500, "Not allowed by CORS");
  });
  test("JSON bodies over 2 MB are rejected", async () => {
    const res = await api("login").send({ email: "x".repeat(2.2 * 1024 * 1024), password: "x" });
    assert.equal(res.status, 413);
    assert.equal(typeof res.body.error, "string");
  });
  test("auth limiter sends standard RateLimit headers", async () => {
    const res = await api("login").send({ email: "nobody@test.local", password: "x" });
    assert.ok(res.headers["ratelimit-limit"] || res.headers.ratelimit, "RateLimit headers present");
  });
});

describe("stats (before any writes)", () => {
  test("counts active families and members", async () => {
    const res = await api("stats");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { families: 2, members: 2 });
  });
});

describe("auth: register", () => {
  test("400 when password is missing or short", async () => {
    assertError(
      await api("register").send({ email: "new@test.local", phone: "9811111111" }),
      400,
      "Email and password are required; password must be at least 6 characters.",
    );
    assertError(
      await api("register").send({ email: "new@test.local", password: "12345", phone: "9811111111" }),
      400,
      "Email and password are required; password must be at least 6 characters.",
    );
  });
  test("400 when phone is invalid", async () => {
    assertError(
      await api("register").send({ email: "new@test.local", password: "secret1", phone: "12345" }),
      400,
      "A valid 10-digit mobile number is required.",
    );
  });
  test("409 when phone is already registered", async () => {
    assertError(
      await api("register").send({ email: "new@test.local", password: "secret1", phone: "9100000002" }),
      409,
      "This mobile number is already registered.",
    );
  });
  test("409 when email is already registered", async () => {
    assertError(
      await api("register").send({ email: "member@test.local", password: "secret1", phone: "9811111110" }),
      409,
      "An account with this email already exists.",
    );
  });
  test("201 creates an unverified account and returns the public user", async () => {
    const res = await api("register").send({
      email: "  New.User@Test.Local ",
      password: "secret1",
      full_name: " New User ",
      phone: "9811111111",
      recaptchaToken: "ignored",
    });
    assert.equal(res.status, 201);
    assert.deepEqual(keys(res.body), ["requiresOtp", "user"]);
    assert.equal(res.body.requiresOtp, true);
    assert.deepEqual(keys(res.body.user), PUBLIC_USER_KEYS);
    assert.deepEqual(
      { ...res.body.user, id: undefined },
      { id: undefined, email: "new.user@test.local", full_name: "New User", phone: "9811111111", role: "user" },
    );
    const [row] = await query("SELECT is_verified, otp_hash FROM users WHERE id = ?", [res.body.user.id]);
    assert.equal(row.is_verified, 0);
  });
});

describe("auth: OTP", () => {
  test("400 when the code is not 6 digits", async () => {
    assertError(await api("verifyOtp").send({ email: "otp@test.local", otpCode: "12" }), 400, "A valid 6-digit verification code is required.");
  });
  test("404 for an unknown account", async () => {
    assertError(await api("verifyOtp").send({ email: "ghost@test.local", otpCode: "123456" }), 404, "Account not found.");
  });
  test("400 for a wrong code", async () => {
    assertError(await api("verifyOtp").send({ email: "otp@test.local", otpCode: "000000" }), 400, "Invalid or expired verification code.");
  });
  test("200 verifies the account and returns a session", async () => {
    const res = await api("verifyOtp").send({ email: "OTP@test.local", otpCode: OTP_CODE });
    assert.equal(res.status, 200);
    assert.deepEqual(keys(res.body), ["access_token", "user"]);
    assert.match(res.body.access_token, /^[0-9a-f]{64}$/);
    assert.equal(res.body.user.email, "otp@test.local");
    const me = await api("me", [], { token: res.body.access_token });
    assert.equal(me.status, 200);
  });
  test("resend: 400 without email", async () => {
    assertError(await api("resendOtp").send({}), 400, "Email is required.");
  });
  test("resend: same 200 response for unknown and unverified accounts", async () => {
    for (const email of ["ghost@test.local", "unverified@test.local"]) {
      const res = await api("resendOtp").send({ email });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
    }
  });
});

describe("auth: login", () => {
  test("401 for a wrong password", async () => {
    assertError(await api("login").send({ email: "login@test.local", password: "wrong" }), 401, "Invalid email/phone or password.");
  });
  test("401 for an unknown user", async () => {
    assertError(await api("login").send({ email: "ghost@test.local", password: "whatever" }), 401, "Invalid email/phone or password.");
  });
  test("403 for an unverified account", async () => {
    assertError(
      await api("login").send({ email: "unverified@test.local", password: PASSWORDS.unverified }),
      403,
      "Please verify your account before logging in.",
    );
  });
  test("200 by email, phone or username", async () => {
    for (const body of [{ email: "LOGIN@test.local" }, { phone: "+91 91000 00006" }, { username: "login@test.local" }]) {
      const res = await api("login").send({ ...body, password: PASSWORDS.login });
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.deepEqual(keys(res.body), ["access_token", "user"]);
      assert.deepEqual(keys(res.body.user), PUBLIC_USER_KEYS);
      assert.equal(res.body.user.id, IDS.loginUser);
    }
  });
});

describe("auth: me and logout", () => {
  test("401 without a token", async () => {
    assertError(await api("me"), 401, "Authentication required.");
  });
  test("401 with an expired session", async () => {
    assertError(await api("me", [], { token: TOKENS.expired }), 401, "Authentication required.");
  });
  test("200 returns only public user fields", async () => {
    const res = await api("me", [], { token: TOKENS.member });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { id: IDS.memberUser, email: "member@test.local", full_name: "member", phone: "9100000002", role: "user" });
  });
  test("logout returns 204 and ends the session", async () => {
    const login = await api("login").send({ email: "login@test.local", password: PASSWORDS.login });
    const res = await api("logout", [], { token: login.body.access_token });
    assert.equal(res.status, 204);
    assert.equal(res.text, "");
    assertError(await api("me", [], { token: login.body.access_token }), 401, "Authentication required.");
  });
  // Existing quirk, preserved on purpose: without a token the UPDATE has no
  // replacement value and the driver error surfaces as a 500.
  test("logout without a token is a 500 (existing behavior)", async () => {
    assertError(await api("logout"), 500, "Positional replacement (?) 0 has no entry in the replacement map (replacements[0] is undefined).");
  });
});

describe("auth: password reset", () => {
  test("request: 400 without email", async () => {
    assertError(await api("resetRequest").send({}), 400, "Email is required.");
  });
  test("request: 200 for unknown and known emails, token stored only for known", async () => {
    for (const email of ["ghost@test.local", "login@test.local"]) {
      const res = await api("resetRequest").send({ email });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { ok: true });
    }
    const [row] = await query("SELECT reset_token_hash FROM users WHERE id = ?", [IDS.loginUser]);
    assert.match(row.reset_token_hash, /^[0-9a-f]{64}$/);
  });
  test("confirm: 400 for missing or short input", async () => {
    assertError(
      await api("resetPassword").send({ resetToken: "abc", newPassword: "123" }),
      400,
      "A valid reset token and password of at least 6 characters are required.",
    );
  });
  test("confirm: 400 for an invalid token", async () => {
    assertError(await api("resetPassword").send({ resetToken: "not-a-real-token", newPassword: "NewPass1" }), 400, "This reset link is invalid or expired.");
  });
  test("confirm: 200 sets the new password", async () => {
    const { createHash } = await import("node:crypto");
    await query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE) WHERE id = ?", [
      createHash("sha256").update("known-reset-token").digest("hex"),
      IDS.loginUser,
    ]);
    const res = await api("resetPassword").send({ resetToken: "known-reset-token", newPassword: "Login@456" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await api("login").send({ email: "login@test.local", password: "Login@456" })).status, 200);
  });
});

describe("auth: change password", () => {
  test("401 without a token", async () => {
    assertError(await api("changePassword").send({ currentPassword: "x", newPassword: "NewPass1" }), 401, "Authentication required.");
  });
  test("400 when the new password is short", async () => {
    assertError(
      await api("changePassword", [], { token: TOKENS.other }).send({ currentPassword: PASSWORDS.member, newPassword: "123" }),
      400,
      "New password must be at least 6 characters.",
    );
  });
  test("401 when the current password is wrong", async () => {
    assertError(
      await api("changePassword", [], { token: TOKENS.other }).send({ currentPassword: "wrong", newPassword: "NewPass1" }),
      401,
      "Current password is incorrect.",
    );
  });
  test("200 changes the password", async () => {
    const res = await api("changePassword", [], { token: TOKENS.other }).send({ currentPassword: PASSWORDS.member, newPassword: "Other@456" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.equal((await api("login").send({ email: "other@test.local", password: "Other@456" })).status, 200);
  });
});

describe("auth: invite", () => {
  test("401 without a token", async () => {
    assertError(await api("invite").send({ email: "invitee@test.local" }), 401, "Authentication required.");
  });
  test("403 for a non-admin", async () => {
    assertError(await api("invite", [], { token: TOKENS.member }).send({ email: "invitee@test.local" }), 403, "Admin access required.");
  });
  test("400 without email", async () => {
    assertError(await api("invite", [], { token: TOKENS.admin }).send({}), 400, "Email is required.");
  });
  test("201 creates an invited user with a random password", async () => {
    const res = await api("invite", [], { token: TOKENS.admin }).send({ email: " Invitee@Test.Local ", full_name: "Invitee", role: "admin" });
    assert.equal(res.status, 201);
    assert.deepEqual(keys(res.body), ["ok", "password", "username"]);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.username, "invitee@test.local");
    assert.match(res.body.password, /^NPS@[A-Za-z0-9_-]{8}!$/);
    const [row] = await query("SELECT role, status, is_verified FROM users WHERE email = 'invitee@test.local'");
    assert.deepEqual({ ...row }, { role: "admin", status: "invited", is_verified: 1 });
    assert.equal((await api("login").send({ email: "invitee@test.local", password: res.body.password })).status, 200);
  });
});

describe("me", () => {
  test("family: 401 without a token", async () => {
    assertError(await api("myFamily"), 401, "Authentication required.");
  });
  test("family: returns own family, members and student", async () => {
    const res = await api("myFamily", [], { token: TOKENS.member });
    assert.equal(res.status, 200);
    assert.deepEqual(keys(res.body), ["family", "members", "student"]);
    assert.equal(res.body.family.family_id, FAMILY1);
    assertRecord(res.body.family);
    assert.deepEqual(
      res.body.members.map((m) => m.id),
      [IDS.member1],
    );
    assert.equal(res.body.student.student_id, "NPSI-STU-000001");
  });
  test("family: nulls for a user without a family", async () => {
    const res = await api("myFamily", [], { token: TOKENS.noFamily });
    assert.deepEqual(res.body, { family: null, members: [], student: null });
  });
  test("feedback: 401 without a token", async () => {
    assertError(await api("myFeedback"), 401, "Authentication required.");
  });
  test("feedback: returns own feedback records", async () => {
    const res = await api("myFeedback", [], { token: TOKENS.member });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((f) => f.feedback_id),
      ["FB-000001"],
    );
    assertRecord(res.body[0]);
  });
});

describe("public lookups", () => {
  test("verify family: 200 with limited columns", async () => {
    const res = await api("verifyFamily", [FAMILY1]);
    assert.equal(res.status, 200);
    assert.deepEqual(keys(res.body.family), ["city", "family_id", "family_name", "head_name", "registration_date", "status"]);
    assert.deepEqual(res.body.members, [{ name: "Member One", relationship: "Self", gender: "Male", status: "ACTIVE" }]);
  });
  test("verify family: 404 for an unknown id", async () => {
    assertError(await api("verifyFamily", ["NPSI-FAM-999999"]), 404, "No family found for this ID.");
  });
  test("track application: 400 without both params", async () => {
    assertError(await api("trackApplication", ["?applicationId=NPSI-APP-2026-000001"]), 400, "Application ID and mobile number are required.");
  });
  test("track application: 404 for a wrong mobile", async () => {
    assertError(
      await api("trackApplication", ["?applicationId=NPSI-APP-2026-000001&mobile=9999999999"]),
      404,
      "No application found for this ID and mobile number.",
    );
  });
  test("track application: 200 returns the record with parsed JSON", async () => {
    const res = await api("trackApplication", ["?applicationId=NPSI-APP-2026-000001&mobile=9400000001"]);
    assert.equal(res.status, 200);
    assertRecord(res.body);
    assert.deepEqual(res.body.members_data, [{ name: "A" }]);
  });
  test("mobile availability", async () => {
    assert.deepEqual((await api("checkMobile", ["?mobile=%2B91%2093000%2000001"])).body, { taken: true });
    assert.deepEqual((await api("checkMobile", ["?mobile=9999999999"])).body, { taken: false });
    assert.deepEqual((await api("checkMobile")).body, { taken: false });
  });
  test("email availability", async () => {
    assert.deepEqual((await api("checkEmail", ["?email=MEMBER@test.local"])).body, { taken: true });
    assert.deepEqual((await api("checkEmail", ["?email=free@test.local"])).body, { taken: false });
    assert.deepEqual((await api("checkEmail")).body, { taken: false });
  });
});

describe("uploads", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
  test("400 without a file", async () => {
    assertError(await api("upload"), 400, "No file uploaded.");
  });
  test("400 for a non-image file", async () => {
    assertError(
      await api("upload").attach("file", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" }),
      400,
      "Only JPEG, PNG, WEBP or GIF images are allowed.",
    );
  });
  test("400 for a file over 5 MB", async () => {
    const res = await api("upload").attach("file", Buffer.alloc(5 * 1024 * 1024 + 10), { filename: "big.png", contentType: "image/png" });
    assertError(res, 400, "File too large");
  });
  test("201 stores the image and serves it from /uploads", async () => {
    const res = await api("upload").attach("file", png, { filename: "../../evil.php", contentType: "image/png" });
    assert.equal(res.status, 201);
    assert.deepEqual(keys(res.body), ["file_url"]);
    const match = res.body.file_url.match(/^http:\/\/127\.0\.0\.1:\d+(\/uploads\/[0-9a-f-]{36}\.png)$/);
    assert.ok(match, res.body.file_url);
    const served = await call("GET", match[1]);
    assert.equal(served.status, 200);
    assert.match(served.headers["content-type"], /image\/png/);
  });
});

describe("entities: list", () => {
  test("public entity needs no token and orders by -createdAt", async () => {
    const res = await api("list", ["Event"]);
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.map((e) => e.title),
      ["Free Event", "Paid Event"],
    );
    res.body.forEach(assertRecord);
  });
  test("order, filter and limit query params", async () => {
    assert.deepEqual(
      (await api("list", ["Event", "?order=title"])).body.map((e) => e.title),
      ["Free Event", "Paid Event"],
    );
    assert.deepEqual(
      (await api("list", ["Event", `?filter=${encodeURIComponent(JSON.stringify({ title: "Paid Event" }))}`])).body.map((e) => e.id),
      [IDS.event],
    );
    assert.equal((await api("list", ["Event", "?limit=1"])).body.length, 1);
  });
  test("malformed filter JSON is a 500 with the error format", async () => {
    const res = await api("list", ["Event", "?filter=%7Bnot-json"]);
    assert.equal(res.status, 500);
    assert.equal(typeof res.body.error, "string");
  });
  test("admin-only entity: 401 anonymous, 403 member, 200 admin", async () => {
    assertError(await api("list", ["Family"]), 401, "Authentication required.");
    assertError(await api("list", ["Family"], { token: TOKENS.member }), 403, "Admin access required.");
    const res = await api("list", ["Family"], { token: TOKENS.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
  });
  test("notifications: members see own family and broadcast only", async () => {
    assertError(await api("list", ["Notification"]), 401, "Authentication required.");
    const member = await api("list", ["Notification"], { token: TOKENS.member });
    assert.deepEqual(member.body.map((n) => n.id).sort(), [IDS.notifOwn, IDS.notifBroadcast].sort());
    const admin = await api("list", ["Notification"], { token: TOKENS.admin });
    assert.equal(admin.body.length, 3);
  });
  test("every entity is listable by an admin", async () => {
    for (const entity of ENTITIES) {
      const res = await api("list", [entity], { token: TOKENS.admin });
      assert.equal(res.status, 200, entity);
      assert.ok(Array.isArray(res.body), entity);
    }
  });
  test("unknown entity is a 404 with the error format", async () => {
    const res = await api("list", ["Unknown"], { token: TOKENS.admin });
    assert.equal(res.status, 404);
    assert.equal(typeof res.body.error, "string");
  });
});

describe("entities: create", () => {
  test("admin-only entity: 401 anonymous, 403 member, 201 admin", async () => {
    assertError(await api("create", ["Announcement"]).send({ title: "T", body: "B" }), 401, "Authentication required.");
    assertError(await api("create", ["Announcement"], { token: TOKENS.member }).send({ title: "T", body: "B" }), 403, "Admin access required.");
    const res = await api("create", ["Announcement"], { token: TOKENS.admin }).send({
      title: "<b>Admins may</b>",
      body: "B",
      date: "2026-02-01T10:00:00.000Z",
    });
    assert.equal(res.status, 201);
    assertRecord(res.body);
    assert.match(res.body.id, /^[0-9a-f-]{36}$/);
    assert.equal(res.body.title, "<b>Admins may</b>");
  });
  // Existing quirk, preserved on purpose: a client-supplied `id` overrides the
  // generated UUID wherever the field whitelist doesn't strip it.
  test("a client-supplied id is kept (existing behavior)", async () => {
    const res = await api("create", ["Announcement"], { token: TOKENS.admin }).send({ id: "client-chosen-id", title: "T", body: "B" });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, "client-chosen-id");
  });
  test("application: validation errors", async () => {
    const valid = {
      family_head_name: "Head",
      mobile: "9876500001",
      family_name: "Fam",
      email: "fam1@test.local",
      address: "Addr",
      city: "Indore",
      district: "Indore",
    };
    assertError(await api("create", ["Application"]).send({ ...valid, mobile: "123" }), 400, "A valid 10-digit mobile number is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, family_name: " " }), 400, "Family name is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, email: "bad" }), 400, "A valid email address is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, address: "" }), 400, "Address is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, city: "" }), 400, "City is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, district: "" }), 400, "District is required.");
    assertError(
      await api("create", ["Application"]).send({ ...valid, family_name: "<script>" }),
      400,
      'The "family_name" field cannot contain < or > characters.',
    );
    assertError(await api("create", ["Application"]).send({ ...valid, mobile: "9300000001" }), 409, "This mobile number is already registered on the portal.");
    assertError(await api("create", ["Application"]).send({ ...valid, email: "member@test.local" }), 409, "This email is already registered on the portal.");
  });
  test("application: 201 with a server-assigned id and parsed JSON", async () => {
    const res = await api("create", ["Application"]).send({
      family_head_name: "Head",
      mobile: "9876500001",
      family_name: "Fam",
      email: "fam1@test.local",
      address: "Addr",
      city: "Indore",
      district: "Indore",
      application_id: "CLIENT",
      members_data: [{ name: "X" }],
      recaptchaToken: "t",
      submitted_date: "2026-02-01T10:00:00.000Z",
    });
    assert.equal(res.status, 201);
    assertRecord(res.body);
    assert.equal(res.body.application_id, `NPSI-APP-${YEAR}-${YEAR === 2026 ? "000002" : "000001"}`);
    assert.deepEqual(res.body.members_data, [{ name: "X" }]);
    assert.ok(!("recaptchaToken" in res.body));
  });
  test("student application: validation and 201", async () => {
    const valid = { student_name: "Stu", mobile: "9876500002", email: "stu1@test.local", gender: "Male", father_name: "Dad", academic_year: "2026" };
    assertError(await api("create", ["StudentApplication"]).send({ ...valid, student_name: "" }), 400, "Student name is required.");
    assertError(
      await api("create", ["StudentApplication"]).send({ ...valid, guardian_mobile: "12" }),
      400,
      "Guardian mobile number must be a valid 10-digit number.",
    );
    assertError(await api("create", ["StudentApplication"]).send({ ...valid, father_name: "" }), 400, "Father's name is required.");
    const res = await api("create", ["StudentApplication"]).send(valid);
    assert.equal(res.status, 201);
    assert.equal(res.body.application_id, `NPSI-STU-APP-${YEAR}-000001`);
  });
  test("transaction and notification: public create", async () => {
    const tx = await api("create", ["Transaction"]).send({ transaction_id: "TX-1", type: "DONATION", amount: 500, date: "2026-02-01" });
    assert.equal(tx.status, 201);
    assertRecord(tx.body);
    const notif = await api("create", ["Notification"]).send({ title: "Submitted", message: "Thanks", type: "info", recipient_family_id: FAMILY1 });
    assert.equal(notif.status, 201);
    assert.equal(notif.body.title, "Submitted");
  });
  test("family: 401 anonymous, 403 member, 201 admin with sequential id", async () => {
    assertError(await api("create", ["Family"]).send({ family_name: "New" }), 401, "Authentication required.");
    assertError(await api("create", ["Family"], { token: TOKENS.member }).send({ family_name: "New" }), 403, "Admin access required.");
    const res = await api("create", ["Family"], { token: TOKENS.admin }).send({ family_name: "New", family_id: "CLIENT", status: "PENDING" });
    assert.equal(res.status, 201);
    assert.equal(res.body.family_id, "NPSI-FAM-000003");
  });
  test("family member: ownership and field whitelist", async () => {
    assertError(
      await api("create", ["FamilyMember"], { token: TOKENS.member }).send({ family_id: FAMILY2, name: "X", relationship: "Son" }),
      403,
      "You can only add members to your own family.",
    );
    assertError(
      await api("create", ["FamilyMember"], { token: TOKENS.noFamily }).send({ family_id: FAMILY1, name: "X", relationship: "Son" }),
      403,
      "You can only add members to your own family.",
    );
    const res = await api("create", ["FamilyMember"], { token: TOKENS.member }).send({
      family_id: FAMILY1,
      name: "Kid",
      relationship: "Son",
      status: "ACTIVE",
      photo_url: "http://x/y.png",
      membership_id: "CLIENT",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.membership_id, "NPSI-MEM-000003");
    assert.equal(res.body.photo_url, null);
    assert.equal(res.body.status, "ACTIVE");
    IDS.createdMember = res.body.id;
  });
  test("feedback: auth required, markup rejected, 201 with sequential id", async () => {
    assertError(await api("create", ["Feedback"]).send({ member_name: "M", message: "Hi" }), 401, "Authentication required.");
    assertError(
      await api("create", ["Feedback"], { token: TOKENS.member }).send({ member_name: "M", message: "<img>" }),
      400,
      'The "message" field cannot contain < or > characters.',
    );
    const res = await api("create", ["Feedback"], { token: TOKENS.member }).send({
      member_name: "M",
      message: "Hi",
      email: "member@test.local",
      internal_note: "stripped",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.feedback_id, "FB-000002");
    assert.equal(res.body.internal_note, null);
  });
  test("event registration: ownership, event lookup and server-side fees", async () => {
    const base = { registration_id: "REG-1", event_id: IDS.event, family_id: FAMILY1, member_ids: [IDS.member1], total_fee: 0, payment_status: "SUCCESS" };
    assertError(
      await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ ...base, family_id: FAMILY2 }),
      403,
      "You can only register your own family for events.",
    );
    assertError(
      await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ ...base, member_ids: [IDS.member2] }),
      403,
      "You can only register members of your own family.",
    );
    assertError(await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ ...base, event_id: "missing" }), 404, "Event not found.");
    const res = await api("create", ["EventRegistration"], { token: TOKENS.member }).send(base);
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.fee_per_member), 100);
    assert.equal(Number(res.body.total_fee), 100);
    assert.equal(res.body.payment_status, "PENDING");
    assert.equal(res.body.registered_by_id, IDS.memberUser);
    assert.deepEqual(res.body.member_ids, [IDS.member1]);
  });
  test("transfer request: ownership checks and forced PENDING status", async () => {
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ request_type: "MEMBER", source_family_id: FAMILY2 }),
      403,
      "You can only request a transfer for your own family.",
    );
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ request_type: "MEMBER", source_membership_id: "NPSI-MEM-000002" }),
      403,
      "You can only request a transfer for a member of your own family.",
    );
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ request_type: "STUDENT", source_student_id: "NPSI-STU-999999" }),
      403,
      "You can only request a transfer for your own student record.",
    );
    const res = await api("create", ["TransferRequest"], { token: TOKENS.member }).send({
      request_type: "MEMBER",
      source_family_id: FAMILY1,
      source_membership_id: "NPSI-MEM-000001",
      status: "APPROVED",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "PENDING");
    assert.equal(res.body.requester_id, IDS.memberUser);
    assert.equal(res.body.request_id, "TRF-000001");
  });
});

describe("entities: batch create", () => {
  test("401 anonymous, 403 member", async () => {
    assertError(await api("bulk", ["Family"]).send({ records: [{}] }), 401, "Authentication required.");
    assertError(await api("bulk", ["Family"], { token: TOKENS.member }).send({ records: [{}] }), 403, "Admin access required.");
  });
  test("200 with an empty array when there is nothing to create", async () => {
    const res = await api("bulk", ["Family"], { token: TOKENS.admin }).send({ records: [] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
  test("201 creates records with consecutive ids", async () => {
    const res = await api("bulk", ["Family"], { token: TOKENS.admin }).send({ records: [{ family_name: "B1" }, { family_name: "B2", registration_date: "" }] });
    assert.equal(res.status, 201);
    assert.deepEqual(
      res.body.map((f) => f.family_id),
      ["NPSI-FAM-000004", "NPSI-FAM-000005"],
    );
    assert.equal(res.body[1].registration_date, null);
  });
});

describe("entities: update", () => {
  test("admin-only entity: 401, 403, 200 and 404", async () => {
    assertError(await api("update", ["Event", IDS.event]).send({ title: "X" }), 401, "Authentication required.");
    assertError(await api("update", ["Event", IDS.event], { token: TOKENS.member }).send({ title: "X" }), 403, "Admin access required.");
    const res = await api("update", ["Event", IDS.event], { token: TOKENS.admin }).send({ title: "Paid Event Updated", created_date: "ignored" });
    assert.equal(res.status, 200);
    assertRecord(res.body);
    assert.equal(res.body.title, "Paid Event Updated");
    assertError(await api("update", ["Event", "missing"], { token: TOKENS.admin }).send({ title: "X" }), 404, "Record not found");
  });
  test("family member: ownership, whitelist and markup", async () => {
    assertError(
      await api("update", ["FamilyMember", IDS.member2], { token: TOKENS.member }).send({ name: "X" }),
      403,
      "You can only update members of your own family.",
    );
    assertError(await api("update", ["FamilyMember", IDS.member1], { token: TOKENS.noFamily }).send({ name: "X" }), 403, "No family found for your account.");
    assertError(
      await api("update", ["FamilyMember", IDS.member1], { token: TOKENS.member }).send({ name: "<x>" }),
      400,
      'The "name" field cannot contain < or > characters.',
    );
    const res = await api("update", ["FamilyMember", IDS.member1], { token: TOKENS.member }).send({ name: "Member Renamed", membership_id: "HACK" });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Member Renamed");
    assert.equal(res.body.membership_id, "NPSI-MEM-000001");
  });
  test("family: members may only update their own family", async () => {
    assertError(await api("update", ["Family", IDS.family2], { token: TOKENS.member }).send({ member_count: 9 }), 403, "You can only update your own family.");
    const res = await api("update", ["Family", IDS.family1], { token: TOKENS.member }).send({ member_count: 2, status: "PENDING" });
    assert.equal(res.status, 200);
    assert.equal(res.body.member_count, 2);
    assert.equal(res.body.status, "ACTIVE");
  });
  test("notification: members may only mark their own as read", async () => {
    assertError(
      await api("update", ["Notification", IDS.notifOther], { token: TOKENS.member }).send({ read: true }),
      403,
      "You can only update your own notifications.",
    );
    const res = await api("update", ["Notification", IDS.notifOwn], { token: TOKENS.member }).send({ read: true, title: "ignored" });
    assert.equal(res.status, 200);
    assert.equal(res.body.read, 1);
    assert.equal(res.body.title, "Own");
  });
});

describe("entities: delete", () => {
  test("admin-only entity: 401, 403, 204", async () => {
    assertError(await api("remove", ["Announcement", IDS.announcement]), 401, "Authentication required.");
    assertError(await api("remove", ["Announcement", IDS.announcement], { token: TOKENS.member }), 403, "Admin access required.");
    const res = await api("remove", ["Announcement", IDS.announcement], { token: TOKENS.admin });
    assert.equal(res.status, 204);
    assert.equal(res.text, "");
  });
  test("family member: only own family members", async () => {
    assertError(await api("remove", ["FamilyMember", IDS.member2], { token: TOKENS.member }), 403, "You can only remove members of your own family.");
    assert.equal((await api("remove", ["FamilyMember", IDS.createdMember], { token: TOKENS.member })).status, 204);
    const [row] = await query("SELECT COUNT(*) AS n FROM family_members WHERE id = ?", [IDS.createdMember]);
    assert.equal(row.n, 0);
  });
});
