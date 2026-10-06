// Contract tests: the source of truth for the API's behavior. Black-box over
// HTTP against the built app (`npm run test:contract`). Tests run in order and
// share one seeded database, so later tests may depend on records created earlier.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { backfillContactDigits, call, FAMILY1, FAMILY2, IDS, OTP_CODE, PASSWORDS, query, setup, TOKENS, teardown } from "./harness.mjs";
import { API, ENTITIES } from "./paths.mjs";

const api = (key, args = [], opts = {}) => {
  const [method, url] = API[key](...args);
  return call(method, url, opts);
};
const YEAR = new Date().getFullYear();
const PUBLIC_USER_KEYS = ["email", "fullName", "id", "phone", "photoUrl", "role"];
const keys = (obj) => Object.keys(obj).sort();
const assertError = (res, status, message) => {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  if (message instanceof RegExp) assert.match(res.body.error, message);
  else assert.deepEqual(res.body, { error: message });
};
const assertRecord = (record) => {
  assert.ok(record.id, "record has id");
  assert.ok("createdAt" in record && "updatedAt" in record, "camelCase timestamps");
  assert.ok(!Object.keys(record).some((key) => key.includes("_")), "no snake_case fields");
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
    assertError(await api("health").set("Origin", "https://someone-else.hostingersite.com"), 500, "Not allowed by CORS");
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
      fullName: " New User ",
      phone: "9811111111",
      recaptchaToken: "ignored",
    });
    assert.equal(res.status, 201);
    assert.deepEqual(keys(res.body), ["requiresOtp", "user"]);
    assert.equal(res.body.requiresOtp, true);
    assert.deepEqual(keys(res.body.user), PUBLIC_USER_KEYS);
    assert.deepEqual(
      { ...res.body.user, id: undefined },
      { id: undefined, email: "new.user@test.local", fullName: "New User", phone: "9811111111", role: "user", photoUrl: null },
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
    assert.deepEqual(keys(res.body), ["accessToken", "user"]);
    assert.match(res.body.accessToken, /^[0-9a-f]{64}$/);
    assert.equal(res.body.user.email, "otp@test.local");
    const me = await api("me", [], { token: res.body.accessToken });
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
      assert.deepEqual(keys(res.body), ["accessToken", "user"]);
      assert.deepEqual(keys(res.body.user), PUBLIC_USER_KEYS);
      assert.equal(res.body.user.id, IDS.loginUser);
    }
  });
});

describe("auth: session cookie", () => {
  test("login sets an httpOnly SameSite=Strict cookie that authenticates on its own; logout clears it", async () => {
    const login = await api("login").send({ email: "login@test.local", password: PASSWORDS.login });
    assert.equal(login.status, 200);
    const setCookie = [login.headers["set-cookie"]].flat().find((c) => c?.startsWith("npsi_session="));
    assert.ok(setCookie, "session cookie set");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Max-Age=2592000/);
    const cookie = setCookie.split(";")[0];
    const me = await api("me").set("Cookie", cookie);
    assert.deepEqual([me.status, me.body.email], [200, "login@test.local"]);
    const logout = await api("logout").set("Cookie", cookie);
    assert.equal(logout.status, 204);
    assert.match([logout.headers["set-cookie"]].flat().join(";"), /npsi_session=;/);
    assertError(await api("me").set("Cookie", cookie), 401, "Authentication required.");
  });
  test("the Authorization header still works and wins over a cookie", async () => {
    const res = await api("me", [], { token: TOKENS.member }).set("Cookie", "npsi_session=not-a-session");
    assert.deepEqual([res.status, res.body.email], [200, "member@test.local"]);
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
    assert.deepEqual(res.body, { id: IDS.memberUser, email: "member@test.local", fullName: "member", phone: "9100000002", role: "user", photoUrl: null });
  });
  test("logout returns 204 and ends the session", async () => {
    const login = await api("login").send({ email: "login@test.local", password: PASSWORDS.login });
    const res = await api("logout", [], { token: login.body.accessToken });
    assert.equal(res.status, 204);
    assert.equal(res.text, "");
    assertError(await api("me", [], { token: login.body.accessToken }), 401, "Authentication required.");
  });
  // Without a token there is no session to end: still a 204, nothing changes.
  test("logout without a token is a no-op 204", async () => {
    const res = await api("logout");
    assert.equal(res.status, 204);
    assert.equal(res.text, "");
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
    const res = await api("invite", [], { token: TOKENS.admin }).send({ email: " Invitee@Test.Local ", fullName: "Invitee", role: "admin" });
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

describe("auth: profile", () => {
  test("PATCH /auth/me: name, mobile and an uploaded photo; outside images and taken mobiles refused", async () => {
    assertError(await api("updateMe").send({ fullName: "X" }), 401, "Authentication required.");
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c63f8cfc0f01f0005000201" + "5f8f9d2a0000000049454e44ae426082",
      "hex",
    );
    const upload = await api("upload").attach("file", png, { filename: "me.png", contentType: "image/png" });
    assert.equal(upload.status, 201);
    const res = await api("updateMe", [], { token: TOKENS.noFamily }).send({ fullName: " Profile Name ", photoUrl: upload.body.fileUrl });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual([res.body.fullName, res.body.photoUrl], ["Profile Name", upload.body.fileUrl]);
    assert.deepEqual(keys(res.body), PUBLIC_USER_KEYS);
    assert.equal((await api("me", [], { token: TOKENS.noFamily })).body.photoUrl, upload.body.fileUrl);
    assertError(
      await api("updateMe", [], { token: TOKENS.noFamily }).send({ photoUrl: "https://evil.example/x.png" }),
      400,
      "The photo must be an image uploaded to the portal.",
    );
    assertError(await api("updateMe", [], { token: TOKENS.noFamily }).send({ phone: "123" }), 400, "A valid 10-digit mobile number is required.");
    assertError(await api("updateMe", [], { token: TOKENS.noFamily }).send({ phone: "9100000002" }), 409, "This mobile number is already registered.");
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
    assert.equal(res.body.family.familyId, FAMILY1);
    assertRecord(res.body.family);
    assert.deepEqual(
      res.body.members.map((m) => m.id),
      [IDS.member1],
    );
    assert.equal(res.body.student.studentId, "NPSI-STU-000001");
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
      res.body.map((f) => f.feedbackId),
      ["FB-000001"],
    );
    assertRecord(res.body[0]);
  });
});

describe("public lookups", () => {
  test("verify family: 200 with limited columns", async () => {
    const res = await api("verifyFamily", [FAMILY1]);
    assert.equal(res.status, 200);
    assert.deepEqual(keys(res.body.family), ["city", "familyId", "familyName", "headName", "registrationDate", "status"]);
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
    assert.deepEqual(res.body.membersData, [{ name: "A" }]);
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
    assertError(
      await api("upload").attach("file", Buffer.from("<html><script>alert(1)</script></html>"), { filename: "x.png", contentType: "image/png" }),
      400,
      "Only JPEG, PNG, WEBP or GIF images are allowed.",
    );
    const res = await api("upload").attach("file", Buffer.alloc(5 * 1024 * 1024 + 10), { filename: "big.png", contentType: "image/png" });
    assertError(res, 400, "File too large");
  });
  test("201 stores the image and serves it from /uploads", async () => {
    const res = await api("upload").attach("file", png, { filename: "../../evil.php", contentType: "image/png" });
    assert.equal(res.status, 201);
    assert.deepEqual(keys(res.body), ["fileUrl"]);
    const match = res.body.fileUrl.match(/^http:\/\/127\.0\.0\.1:\d+(\/uploads\/[0-9a-f-]{36}\.png)$/);
    assert.ok(match, res.body.fileUrl);
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
  test("order and limit query params; resource filters as plain query parameters", async () => {
    assert.deepEqual(
      (await api("list", ["Event", "?order=title"])).body.map((e) => e.title),
      ["Free Event", "Paid Event"],
    );
    assert.equal((await api("list", ["Event", "?limit=1"])).body.length, 1);
    assert.deepEqual(
      (await api("list", ["FamilyMember", `?familyId=${FAMILY1}`], { token: TOKENS.admin })).body.map((m) => m.familyId),
      [FAMILY1],
    );
    assert.deepEqual(
      (await api("list", ["Family", `?familyId=${FAMILY2}&status=ACTIVE`], { token: TOKENS.admin })).body.map((f) => f.familyId),
      [FAMILY2],
    );
  });
  test("paging: limit + offset walk the list without gaps or repeats", async () => {
    const all = (await api("list", ["Event", "?order=title"])).body.map((e) => e.id);
    const paged = [];
    for (let offset = 0; offset < all.length; offset += 1)
      paged.push(...(await api("list", ["Event", `?order=title&limit=1&offset=${offset}`])).body.map((e) => e.id));
    assert.deepEqual(paged, all);
    assert.deepEqual((await api("list", ["Event", `?limit=1&offset=${all.length}`])).body, []);
    assertError(await api("list", ["Event", "?offset=-1"]), 400, "offset must not be less than 0");
  });
  test("unknown order fields and out-of-range limits are 400s; unknown query parameters are ignored", async () => {
    assertError(await api("list", ["Event", "?order=nope"]), 400, /^order must be one of the following values: /);
    assertError(await api("list", ["Event", "?limit=0"]), 400, "limit must not be less than 1");
    assert.equal((await api("list", ["Event", "?filter=%7Bnot-json"])).status, 200);
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
  test("ids are always generated by the server", async () => {
    const res = await api("create", ["Announcement"], { token: TOKENS.admin }).send({ id: "client-chosen-id", title: "T", body: "B" });
    assert.equal(res.status, 201);
    assert.match(res.body.id, /^[0-9a-f-]{36}$/);
  });
  test("application: validation errors", async () => {
    const valid = {
      familyHeadName: "Head",
      mobile: "9876500001",
      familyName: "Fam",
      email: "fam1@test.local",
      address: "Addr",
      city: "Indore",
      district: "Indore",
    };
    assertError(await api("create", ["Application"]).send({ ...valid, mobile: "123" }), 400, "A valid 10-digit mobile number is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, familyName: " " }), 400, "Family name is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, email: "bad" }), 400, "A valid email address is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, address: "" }), 400, "Address is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, city: "" }), 400, "City is required.");
    assertError(await api("create", ["Application"]).send({ ...valid, district: "" }), 400, "District is required.");
    assertError(
      await api("create", ["Application"]).send({ ...valid, familyName: "<script>" }),
      400,
      'The "familyName" field cannot contain < or > characters.',
    );
    assertError(await api("create", ["Application"]).send({ ...valid, mobile: "9300000001" }), 409, "This mobile number is already registered on the portal.");
    assertError(await api("create", ["Application"]).send({ ...valid, email: "member@test.local" }), 409, "This email is already registered on the portal.");
  });
  test("application: 201 with a server-assigned id and parsed JSON", async () => {
    const res = await api("create", ["Application"]).send({
      familyHeadName: "Head",
      mobile: "9876500001",
      familyName: "Fam",
      email: "fam1@test.local",
      address: "Addr",
      city: "Indore",
      district: "Indore",
      applicationId: "CLIENT",
      membersData: [{ name: "X" }],
      recaptchaToken: "t",
      submittedDate: "2026-02-01T10:00:00.000Z",
    });
    assert.equal(res.status, 201);
    assertRecord(res.body);
    assert.equal(res.body.applicationId, `NPSI-APP-${YEAR}-${YEAR === 2026 ? "000002" : "000001"}`);
    assert.deepEqual(res.body.membersData, [{ name: "X" }]);
    assert.ok(!("recaptchaToken" in res.body));
  });
  test("student application: validation and 201", async () => {
    const valid = { studentName: "Stu", mobile: "9876500002", email: "stu1@test.local", gender: "Male", fatherName: "Dad", academicYear: "2026" };
    assertError(await api("create", ["StudentApplication"]).send({ ...valid, studentName: "" }), 400, "Student name is required.");
    assertError(
      await api("create", ["StudentApplication"]).send({ ...valid, guardianMobile: "12" }),
      400,
      "Guardian mobile number must be a valid 10-digit number.",
    );
    assertError(await api("create", ["StudentApplication"]).send({ ...valid, fatherName: "" }), 400, "Father's name is required.");
    const res = await api("create", ["StudentApplication"]).send(valid);
    assert.equal(res.status, 201);
    assert.equal(res.body.applicationId, `NPSI-STU-APP-${YEAR}-000001`);
  });
  test("family registration: the application, its PENDING fee and its 'submitted' notification are written together", async () => {
    const app = await api("create", ["Application"]).send({
      familyHeadName: "Flow",
      mobile: "9876500011",
      familyName: "Flow",
      email: "flow@test.local",
      address: "Addr",
      city: "Indore",
      district: "Indore",
      status: "APPROVED",
      adminRemarks: "self-approved",
      recaptchaToken: "t",
    });
    assert.equal(app.status, 201);
    assert.deepEqual([app.body.status, app.body.adminRemarks], ["PENDING_VERIFICATION", null]);
    const ref = app.body.applicationId;
    const fee = (await api("list", ["Transaction", "?limit=500"], { token: TOKENS.admin })).body.find((t) => t.referenceId === ref);
    assert.deepEqual([fee?.type, fee?.amount, fee?.paymentStatus, fee?.familyId], ["Family Registration", 500, "PENDING", null]);
    const notice = (await api("list", ["Notification", "?limit=500"], { token: TOKENS.admin })).body.find((n) => n.recipientFamilyId === ref);
    assert.deepEqual([notice?.type, notice?.title], ["Registration", "Application Submitted"]);
  });
  test("only admins create transactions and notifications", async () => {
    const tx = { transactionId: "TX-X", type: "DONATION", amount: 500 };
    assertError(await api("create", ["Transaction"]).send(tx), 401, "Authentication required.");
    assertError(await api("create", ["Transaction"], { token: TOKENS.member }).send(tx), 403, "Admin access required.");
    const notice = { title: "Hi", message: "M", type: "info", recipientFamilyId: FAMILY1 };
    assertError(await api("create", ["Notification"]).send(notice), 401, "Authentication required.");
    assertError(await api("create", ["Notification"], { token: TOKENS.member }).send(notice), 403, "Admin access required.");
  });
  test("event registration: registration, payment and confirmation in one call; fee from the event", async () => {
    const res = await api("create", ["EventRegistration"], { token: TOKENS.member }).send({
      eventId: IDS.event,
      familyId: FAMILY1,
      memberIds: [IDS.member1],
      totalFee: 0,
      paymentStatus: "SUCCESS",
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.registrationId, /^EVT-REG-\d{6}$/);
    assert.deepEqual([res.body.feePerMember, res.body.totalFee, res.body.paymentStatus, res.body.registeredById], [100, 100, "PENDING", IDS.memberUser]);
    const payment = (await api("list", ["Transaction", "?limit=500"], { token: TOKENS.admin })).body.find((t) => t.referenceId === res.body.registrationId);
    assert.deepEqual(
      [payment?.transactionId, payment?.type, payment?.amount, payment?.paymentStatus, payment?.familyId, payment?.memberId],
      [res.body.transactionId, "Event Registration", 100, "PENDING", FAMILY1, "NPSI-MEM-000001"],
    );
    const seen = (await api("list", ["Notification"], { token: TOKENS.member })).body;
    assert.ok(seen.some((n) => n.type === "Event" && n.recipientFamilyId === FAMILY1 && n.message.includes("Paid Event")));
    const free = await api("create", ["EventRegistration"], { token: TOKENS.member }).send({
      eventId: IDS.freeEvent,
      familyId: FAMILY1,
      memberIds: [IDS.member1],
    });
    assert.equal(free.body.paymentStatus, "SUCCESS");
    assertError(
      await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ eventId: IDS.event, familyId: FAMILY2, memberIds: [] }),
      403,
      "You can only register your own family for events.",
    );
  });
  test("family: 401 anonymous, 403 member, 201 admin with sequential id", async () => {
    assertError(await api("create", ["Family"]).send({ familyName: "New" }), 401, "Authentication required.");
    assertError(await api("create", ["Family"], { token: TOKENS.member }).send({ familyName: "New" }), 403, "Admin access required.");
    const res = await api("create", ["Family"], { token: TOKENS.admin }).send({ familyName: "New", familyId: "CLIENT", status: "PENDING" });
    assert.equal(res.status, 201);
    assert.equal(res.body.familyId, "NPSI-FAM-000003");
  });
  test("family member: ownership and field whitelist", async () => {
    assertError(
      await api("create", ["FamilyMember"], { token: TOKENS.member }).send({ familyId: FAMILY2, name: "X", relationship: "Son" }),
      403,
      "You can only add members to your own family.",
    );
    assertError(
      await api("create", ["FamilyMember"], { token: TOKENS.noFamily }).send({ familyId: FAMILY1, name: "X", relationship: "Son" }),
      403,
      "You can only add members to your own family.",
    );
    const res = await api("create", ["FamilyMember"], { token: TOKENS.member }).send({
      familyId: FAMILY1,
      name: "Kid",
      relationship: "Son",
      status: "ACTIVE",
      photoUrl: "http://x/y.png",
      membershipId: "CLIENT",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.membershipId, "NPSI-MEM-000003");
    assert.equal(res.body.photoUrl, null);
    assert.equal(res.body.status, "ACTIVE");
    IDS.createdMember = res.body.id;
  });
  test("feedback: auth required, markup rejected, 201 with sequential id", async () => {
    assertError(await api("create", ["Feedback"]).send({ memberName: "M", message: "Hi" }), 401, "Authentication required.");
    assertError(
      await api("create", ["Feedback"], { token: TOKENS.member }).send({ memberName: "M", message: "<img>" }),
      400,
      'The "message" field cannot contain < or > characters.',
    );
    const res = await api("create", ["Feedback"], { token: TOKENS.member }).send({
      memberName: "M",
      message: "Hi",
      email: "member@test.local",
      internalNote: "stripped",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.feedbackId, "FB-000002");
    assert.equal(res.body.internalNote, null);
  });
  test("event registration: ownership, event lookup and server-side fees", async () => {
    const base = { registrationId: "REG-1", eventId: IDS.event, familyId: FAMILY1, memberIds: [IDS.member1], totalFee: 0, paymentStatus: "SUCCESS" };
    assertError(
      await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ ...base, familyId: FAMILY2 }),
      403,
      "You can only register your own family for events.",
    );
    assertError(
      await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ ...base, memberIds: [IDS.member2] }),
      403,
      "You can only register members of your own family.",
    );
    assertError(await api("create", ["EventRegistration"], { token: TOKENS.member }).send({ ...base, eventId: "missing" }), 404, "Event not found.");
    const res = await api("create", ["EventRegistration"], { token: TOKENS.member }).send(base);
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.feePerMember), 100);
    assert.equal(Number(res.body.totalFee), 100);
    assert.equal(res.body.paymentStatus, "PENDING");
    assert.equal(res.body.registeredById, IDS.memberUser);
    assert.deepEqual(res.body.memberIds, [IDS.member1]);
  });
  test("transfer request: ownership checks and forced PENDING status", async () => {
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ requestType: "family_to_family", sourceFamilyId: FAMILY2 }),
      403,
      "You can only request a transfer for your own family.",
    );
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ requestType: "family_to_family", sourceMembershipId: "NPSI-MEM-000002" }),
      403,
      "You can only request a transfer for a member of your own family.",
    );
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ requestType: "student_to_family", sourceStudentId: "NPSI-STU-999999" }),
      403,
      "You can only request a transfer for your own student record.",
    );
    const res = await api("create", ["TransferRequest"], { token: TOKENS.member }).send({
      requestType: "family_to_family",
      sourceFamilyId: FAMILY1,
      sourceMembershipId: "NPSI-MEM-000001",
      status: "APPROVED",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, "PENDING");
    assert.equal(res.body.requesterId, IDS.memberUser);
    assert.equal(res.body.requestId, "TRF-000001");
  });
});

describe("column value formats", () => {
  // How each column type comes back: DATE as YYYY-MM-DD, decimals as numbers,
  // date-times as ISO strings, booleans as true/false, JSON as values.
  test("date-only, decimal, datetime, boolean and JSON columns", async () => {
    const event = await api("create", ["Event"], { token: TOKENS.admin }).send({
      title: "Formats",
      date: "2026-12-31",
      venue: "Hall",
      fee: 99.5,
      capacity: "40",
      registrationOpen: "2026-11-01T10:00:00.000Z",
      status: "PUBLISHED",
    });
    assert.equal(event.status, 201, JSON.stringify(event.body));
    assert.equal(event.body.date, "2026-12-31");
    assert.equal(event.body.fee, 99.5);
    assert.equal(event.body.capacity, 40);
    assert.match(event.body.registrationOpen, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    const listed = (await api("list", ["Event"])).body.find((e) => e.title === "Formats");
    assert.deepEqual(listed, event.body);
    const feedback = await api("create", ["Feedback"], { token: TOKENS.admin }).send({ memberName: "F", archived: 1, rating: "4", questions: { q1: "yes" } });
    assert.equal(feedback.status, 201, JSON.stringify(feedback.body));
    assert.equal(feedback.body.archived, true);
    assert.equal(feedback.body.rating, 4);
    assert.deepEqual(feedback.body.questions, { q1: "yes" });
    const patched = await api("update", ["Feedback", feedback.body.id], { token: TOKENS.admin }).send({ archived: false, questions: ["a", "b"] });
    assert.equal(patched.body.archived, false);
    assert.deepEqual(patched.body.questions, ["a", "b"]);
  });
  test("statuses and types are limited to their known values", async () => {
    assertError(
      await api("create", ["Family"], { token: TOKENS.admin }).send({ familyName: "X", status: "ACTIV" }),
      400,
      "status must be one of the following values: PENDING, ACTIVE, SUSPENDED, DEACTIVATED",
    );
    assertError(
      await api("update", ["Event", IDS.event], { token: TOKENS.admin }).send({ status: "LIVE" }),
      400,
      "status must be one of the following values: DRAFT, PUBLISHED, ARCHIVED",
    );
    await query("UPDATE events SET updated_at = '2020-01-01 00:00:00' WHERE id = ?", [IDS.event]);
    const ok = await api("update", ["Event", IDS.event], { token: TOKENS.admin }).send({ status: "PUBLISHED" });
    assert.equal(ok.status, 200);
    assert.ok(new Date(ok.body.updatedAt).getFullYear() > 2020, "an update moves updatedAt (Prisma @updatedAt)");
  });
  test("wrong types are 400s that name the field", async () => {
    assertError(await api("create", ["Event"], { token: TOKENS.admin }).send({ title: "T", date: "soon", venue: "Hall" }), 400, "Date is required.");
    assertError(
      await api("create", ["Event"], { token: TOKENS.admin }).send({ title: "T", date: "2026-12-31", venue: "Hall", capacity: "many" }),
      400,
      "capacity must be an integer number",
    );
    assertError(
      await api("create", ["Feedback"], { token: TOKENS.admin }).send({ memberName: "F", archived: "maybe" }),
      400,
      "archived must be a boolean value",
    );
  });
});

describe("family members: batch create", () => {
  test("401 anonymous, 403 member; only family members have a batch endpoint", async () => {
    assertError(await api("bulk", ["FamilyMember"]).send({ records: [] }), 401, "Authentication required.");
    assertError(await api("bulk", ["FamilyMember"], { token: TOKENS.member }).send({ records: [] }), 403, "Admin access required.");
    assert.equal((await api("bulk", ["Family"], { token: TOKENS.admin }).send({ records: [] })).status, 404);
  });
  test("200 with an empty array when there is nothing to create", async () => {
    const res = await api("bulk", ["FamilyMember"], { token: TOKENS.admin }).send({ records: [] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });
  test("201 creates records with consecutive membership ids, all or nothing", async () => {
    const bad = await api("bulk", ["FamilyMember"], { token: TOKENS.admin }).send({
      records: [{ familyId: FAMILY2, name: "B0", relationship: "Son" }, { familyId: FAMILY2 }],
    });
    assertError(bad, 400, "records.1.Name is required.; records.1.Relationship is required.");
    const res = await api("bulk", ["FamilyMember"], { token: TOKENS.admin }).send({
      records: [
        { familyId: FAMILY2, name: "B1", relationship: "Son" },
        { familyId: FAMILY2, name: "B2", relationship: "Daughter", dob: "" },
      ],
    });
    assert.equal(res.status, 201);
    const [first, second] = res.body.map((m) => Number(m.membershipId.slice("NPSI-MEM-".length)));
    assert.equal(second, first + 1);
    assert.equal(res.body[1].dob, null);
  });
});

describe("entities: update", () => {
  test("admin-only entity: 401, 403, 200 and 404", async () => {
    assertError(await api("update", ["Event", IDS.event]).send({ title: "X" }), 401, "Authentication required.");
    assertError(await api("update", ["Event", IDS.event], { token: TOKENS.member }).send({ title: "X" }), 403, "Admin access required.");
    const res = await api("update", ["Event", IDS.event], { token: TOKENS.admin }).send({ title: "Paid Event Updated", createdAt: "ignored" });
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
    const res = await api("update", ["FamilyMember", IDS.member1], { token: TOKENS.member }).send({ name: "Member Renamed", membershipId: "HACK" });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Member Renamed");
    assert.equal(res.body.membershipId, "NPSI-MEM-000001");
  });
  test("family: members may only update their own family", async () => {
    assertError(await api("update", ["Family", IDS.family2], { token: TOKENS.member }).send({ memberCount: 9 }), 403, "You can only update your own family.");
    const res = await api("update", ["Family", IDS.family1], { token: TOKENS.member }).send({ memberCount: 2, status: "PENDING" });
    assert.equal(res.status, 200);
    assert.equal(res.body.memberCount, 2);
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
    assert.equal(res.body.read, true);
    assert.equal(res.body.title, "Own");
  });
});

describe("foreign keys", () => {
  test("a member must belong to an existing family (400, not a database error)", async () => {
    assertError(
      await api("create", ["FamilyMember"], { token: TOKENS.admin }).send({ familyId: "NPSI-FAM-999999", name: "Ghost", relationship: "Son" }),
      400,
      "A referenced record does not exist.",
    );
  });
  test("deleting a family deletes its members", async () => {
    const family = await api("create", ["Family"], { token: TOKENS.admin }).send({ familyName: "Temporary", status: "ACTIVE" });
    const member = await api("create", ["FamilyMember"], { token: TOKENS.admin }).send({ familyId: family.body.familyId, name: "Temp", relationship: "Self" });
    assert.equal(member.status, 201);
    assert.equal((await api("remove", ["Family", family.body.id], { token: TOKENS.admin })).status, 204);
    const [row] = await query("SELECT COUNT(*) AS n FROM family_members WHERE id = ?", [member.body.id]);
    assert.equal(row.n, 0);
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

describe("duplicate contact rules", () => {
  before(async () => {
    await query(
      "INSERT INTO applications (id, application_id, status, family_head_name, family_name, mobile, email) VALUES ('dup-rej', 'DUP-REJ', 'REJECTED', 'H', 'F', '9611111111', 'rejected@test.local'), ('dup-null', 'DUP-NULL', NULL, 'H', 'F', '9622222222', 'nullstatus@test.local')",
    );
    await query(
      "INSERT INTO families (id, family_id, family_name, contact_number, email) VALUES ('dup-fam', 'DUP-FAM', 'F', '+91 96333-33333', '  Spaced@Test.Local ')",
    );
    await query(
      "INSERT INTO student_applications (id, application_id, status, student_name, mobile, email) VALUES ('dup-stu-rej', 'DUP-STU-REJ', 'REJECTED', 'S', '9644444444', 'sturej@test.local')",
    );
    await query("INSERT INTO students (id, student_id, student_name, mobile, email) VALUES ('dup-stu', 'DUP-STU', 'S', '9655555555', 'student2@test.local')");
    await backfillContactDigits();
  });
  const mobile = async (value) => (await api("checkMobile", [`?mobile=${encodeURIComponent(value)}`])).body.taken;
  const email = async (value) => (await api("checkEmail", [`?email=${encodeURIComponent(value)}`])).body.taken;

  test("rejected applications release their mobile and email; a NULL status still holds them", async () => {
    assert.equal(await mobile("9611111111"), false);
    assert.equal(await email("rejected@test.local"), false);
    assert.equal(await mobile("9622222222"), true);
    assert.equal(await email("NullStatus@test.local"), true);
  });
  test("stored values are normalized: formatted mobiles and padded, mixed-case emails", async () => {
    assert.equal(await mobile("9633333333"), true);
    assert.equal(await email("spaced@test.local"), true);
    assert.equal(await mobile("9644444444"), false, "rejected student application");
    assert.equal(await mobile("9655555555"), true, "students count for the public check");
  });
  test("a new family application ignores student mobiles but not family contacts", async () => {
    const base = { familyHeadName: "H", familyName: "F", address: "A", city: "C", district: "D" };
    const student = await api("create", ["Application"]).send({ ...base, mobile: "9655555555", email: "dupcheck1@test.local" });
    assert.equal(student.status, 201, JSON.stringify(student.body));
    assertError(
      await api("create", ["Application"]).send({ ...base, mobile: "+91 9633333333", email: "dupcheck2@test.local" }),
      409,
      "This mobile number is already registered on the portal.",
    );
    assertError(
      await api("create", ["Application"]).send({ ...base, mobile: "9876500099", email: "SPACED@test.local" }),
      409,
      "This email is already registered on the portal.",
    );
  });
});

describe("notifications module", () => {
  test("an admin's blank recipient is a broadcast that members see", async () => {
    const sent = await api("create", ["Notification"], { token: TOKENS.admin }).send({
      title: "Everyone",
      message: "Hello",
      type: "Announcement",
      recipientFamilyId: "",
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.recipientFamilyId, null);
    const seen = await api("list", ["Notification"], { token: TOKENS.member });
    assert.ok(seen.body.some((n) => n.id === sent.body.id));
  });
  test("camelCase fields in and out; snake_case fields are ignored", async () => {
    const res = await api("create", ["Notification"], { token: TOKENS.admin }).send({
      title: "Shape",
      message: "M",
      type: "Event",
      recipientFamilyId: FAMILY2,
      deepLink: "/events",
      deep_link: "/ignored",
    });
    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.body).sort(), [
      "createdAt",
      "date",
      "deepLink",
      "id",
      "message",
      "read",
      "recipientFamilyId",
      "title",
      "type",
      "updatedAt",
    ]);
    assert.deepEqual([res.body.recipientFamilyId, res.body.deepLink, res.body.read], [FAMILY2, "/events", false]);
  });
  test("list: order by date or createdAt, limit 1-500; anything else is a 400", async () => {
    const res = await api("list", ["Notification", "?order=-date&limit=2"], { token: TOKENS.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assertError(
      await api("list", ["Notification", "?order=title"], { token: TOKENS.admin }),
      400,
      "order must be one of the following values: date, -date, createdAt, -createdAt",
    );
    assertError(await api("list", ["Notification", "?limit=9999"], { token: TOKENS.admin }), 400, "limit must not be greater than 500");
  });
  test("missing title, message or type is a 400", async () => {
    assertError(await api("create", ["Notification"], { token: TOKENS.admin }).send({ message: "M", type: "Event" }), 400, "Title is required.");
    assertError(await api("create", ["Notification"], { token: TOKENS.admin }).send({ title: "T", type: "Event" }), 400, "Message is required.");
    assertError(await api("create", ["Notification"], { token: TOKENS.admin }).send({ title: "T", message: "M" }), 400, "Type is required.");
  });
  test("batch: all or nothing", async () => {
    const before = (await api("list", ["Notification"], { token: TOKENS.admin })).body.length;
    const bad = await api("bulk", ["Notification"], { token: TOKENS.admin }).send({ records: [{ title: "A", message: "M", type: "Event" }, { title: "B" }] });
    assertError(bad, 400, "records.1.Message is required.; records.1.Type is required.");
    assert.equal((await api("list", ["Notification"], { token: TOKENS.admin })).body.length, before);
    const good = await api("bulk", ["Notification"], { token: TOKENS.admin }).send({
      records: [
        { title: "A", message: "M", type: "Event" },
        { title: "B", message: "M", type: "Event" },
      ],
    });
    assert.equal(good.status, 201);
    assert.deepEqual(
      good.body.map((n) => n.title),
      ["A", "B"],
    );
  });
});

describe("reviews (end to end, last: they create families and move members)", () => {
  test("family application: admin only; remarks needed to reject; approval creates the family and members and notifies them", async () => {
    assertError(await api("review", ["Application", IDS.application]).send({ decision: "APPROVED" }), 401, "Authentication required.");
    assertError(await api("review", ["Application", IDS.application], { token: TOKENS.member }).send({ decision: "APPROVED" }), 403, "Admin access required.");
    assertError(
      await api("review", ["Application", IDS.application], { token: TOKENS.admin }).send({ decision: "MAYBE" }),
      400,
      "Decision must be APPROVED, REJECTED or CORRECTION_REQUIRED.",
    );
    assertError(
      await api("review", ["Application", IDS.application], { token: TOKENS.admin }).send({ decision: "REJECTED" }),
      400,
      "Remarks are required to reject or ask for a correction.",
    );
    assertError(await api("review", ["Application", "missing"], { token: TOKENS.admin }).send({ decision: "APPROVED" }), 404, "Application not found.");
    const res = await api("review", ["Application", IDS.application], { token: TOKENS.admin }).send({ decision: "APPROVED" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { application, family, members } = res.body;
    assert.deepEqual([application.status, application.resultingFamilyId], ["APPROVED", family.familyId]);
    assert.deepEqual([family.status, family.headName, family.memberCount, family.applicationId], ["ACTIVE", "Applicant", 1, "NPSI-APP-2026-000001"]);
    assert.deepEqual(
      members.map((m) => [m.name, m.familyId, m.status]),
      [["A", family.familyId, "ACTIVE"]],
    );
    const listed = (await api("list", ["Family", `?familyId=${family.familyId}`], { token: TOKENS.admin })).body;
    assert.equal(listed.length, 1);
    const notice = (await api("list", ["Notification", "?limit=500"], { token: TOKENS.admin })).body.find((n) => n.recipientFamilyId === family.familyId);
    assert.equal(notice?.type, "Approval");
    assertError(
      await api("review", ["Application", IDS.application], { token: TOKENS.admin }).send({ decision: "APPROVED" }),
      409,
      "This application has already been approved.",
    );
  });
  test("student application: correction, then approval creates the student record", async () => {
    const created = await api("create", ["StudentApplication"]).send({
      studentName: "Review Kid",
      mobile: "9876500077",
      email: "reviewkid@test.local",
      gender: "Male",
      fatherName: "Dad",
      academicYear: "2026",
    });
    assert.equal(created.status, 201);
    const corrected = await api("review", ["StudentApplication", created.body.id], { token: TOKENS.admin }).send({
      decision: "CORRECTION_REQUIRED",
      remarks: "Add photo",
      lang: "hi",
    });
    assert.deepEqual([corrected.body.application.status, corrected.body.student], ["CORRECTION_REQUIRED", null]);
    const approved = await api("review", ["StudentApplication", created.body.id], { token: TOKENS.admin }).send({ decision: "APPROVED" });
    assert.equal(approved.status, 200);
    assert.match(approved.body.student.studentId, /^NPSI-STU-\d{6}$/);
    assert.deepEqual([approved.body.student.status, approved.body.application.resultingStudentId], ["ACTIVE", approved.body.student.studentId]);
  });
  test("transfer: member request notifies the target family; approval moves the member and updates both counts", async () => {
    const request = await api("create", ["TransferRequest"], { token: TOKENS.member }).send({
      requestType: "family_to_family",
      sourceFamilyId: FAMILY1,
      sourceMembershipId: "NPSI-MEM-000001",
      targetFamilyId: FAMILY2,
      reason: "Moving",
    });
    assert.equal(request.status, 201, JSON.stringify(request.body));
    const targetNotice = (await api("list", ["Notification", "?limit=500"], { token: TOKENS.admin })).body.find(
      (n) => n.recipientFamilyId === FAMILY2 && n.message.includes(request.body.requestId),
    );
    assert.equal(targetNotice?.title, "New Transfer Request");
    assertError(
      await api("create", ["TransferRequest"], { token: TOKENS.member }).send({ requestType: "family_to_family", targetFamilyId: "NPSI-FAM-999999" }),
      404,
      "Target family not found.",
    );
    const before = (await api("list", ["Family", `?familyId=${FAMILY2}`], { token: TOKENS.admin })).body[0].memberCount ?? 0;
    const approved = await api("review", ["TransferRequest", request.body.id], { token: TOKENS.admin }).send({ decision: "APPROVED", remarks: "ok" });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.deepEqual(
      [approved.body.status, approved.body.oldFamilyId, approved.body.newFamilyId, approved.body.approvedById],
      ["APPROVED", FAMILY1, FAMILY2, IDS.adminUser],
    );
    const moved = (await api("list", ["FamilyMember", `?familyId=${FAMILY2}`], { token: TOKENS.admin })).body.find((m) => m.membershipId === "NPSI-MEM-000001");
    assert.ok(moved, "member now in the target family");
    assert.equal((await api("list", ["Family", `?familyId=${FAMILY2}`], { token: TOKENS.admin })).body[0].memberCount, before + 1);
    assertError(
      await api("review", ["TransferRequest", request.body.id], { token: TOKENS.admin }).send({ decision: "APPROVED" }),
      409,
      "This transfer request has already been approved.",
    );
  });
});

describe("sessions: several devices", () => {
  const login = async () => (await api("login").send({ email: "devices@test.local", password: PASSWORDS.member })).body.accessToken;
  const me = async (token) => (await api("me", [], { token })).status;

  test("two devices stay logged in; logging out one leaves the other", async () => {
    const laptop = await login();
    const phone = await login();
    assert.notEqual(laptop, phone);
    assert.deepEqual([await me(laptop), await me(phone)], [200, 200]);
    assert.equal((await api("logout", [], { token: laptop })).status, 204);
    assert.deepEqual([await me(laptop), await me(phone)], [401, 200]);
    await api("logout", [], { token: phone });
  });
  test("changing the password keeps this device and logs out the others", async () => {
    const laptop = await login();
    const phone = await login();
    const res = await api("changePassword", [], { token: laptop }).send({ currentPassword: PASSWORDS.member, newPassword: "Devices@456" });
    assert.equal(res.status, 200);
    assert.deepEqual([await me(laptop), await me(phone)], [200, 401]);
    await api("changePassword", [], { token: laptop }).send({ currentPassword: "Devices@456", newPassword: PASSWORDS.member });
    await api("logout", [], { token: laptop });
  });
  test("log out everywhere ends every session and clears the cookie", async () => {
    assertError(await api("logoutEverywhere"), 401, "Authentication required.");
    const laptop = await login();
    const phone = await login();
    const res = await api("logoutEverywhere", [], { token: phone });
    assert.equal(res.status, 204);
    assert.match([res.headers["set-cookie"]].flat().join(";"), /npsi_session=;/);
    assert.deepEqual([await me(laptop), await me(phone)], [401, 401]);
  });
});

describe("notifications: broadcasts are read per member", () => {
  test("one member marking a broadcast read doesn't mark it for another", async () => {
    const broadcast = await api("create", ["Notification"], { token: TOKENS.admin }).send({ title: "For all", message: "M", type: "Announcement" });
    const id = broadcast.body.id;
    const readFor = async (token) => (await api("list", ["Notification", "?limit=500"], { token })).body.find((n) => n.id === id)?.read;
    assert.deepEqual([await readFor(TOKENS.member), await readFor(TOKENS.other)], [false, false]);
    const marked = await api("update", ["Notification", id], { token: TOKENS.member }).send({ read: true });
    assert.deepEqual([marked.status, marked.body.read], [200, true]);
    assert.deepEqual([await readFor(TOKENS.member), await readFor(TOKENS.other)], [true, false]);
    const [row] = await query("SELECT `read` FROM notifications WHERE id = ?", [id]);
    assert.equal(row.read, 0, "the shared row is untouched");
    const unread = await api("update", ["Notification", id], { token: TOKENS.member }).send({ read: false });
    assert.equal(unread.body.read, false);
  });
});
