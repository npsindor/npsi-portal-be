import assert from "node:assert/strict";
import { beforeEach, describe, mock, test } from "node:test";
import { hashOtp, hashPassword, sha256 } from "../common/utils/crypto.js";
import { as, fakeConfig, fakeMail, fakeRecaptcha, flush, rejectsWith, user } from "../testing/fakes.js";
import { AuthService } from "./auth.service.js";
import type { UsersRepository } from "./users.repository.js";

const PASSWORD = "secret1";

const fakeUsers = () => ({
  findById: mock.fn(async (id: string) => user({ id, email: "new@example.com", fullName: "New", isVerified: false })),
  findIdByPhone: mock.fn(async (_phone: string): Promise<{ id: string } | undefined> => undefined),
  findByEmail: mock.fn(async (_email: string): Promise<ReturnType<typeof user> | undefined> => undefined),
  findIdByEmail: mock.fn(async (_email: string): Promise<{ id: string } | undefined> => undefined),
  findForLogin: mock.fn(async (_identifier: string, _phone: string): Promise<ReturnType<typeof user> | undefined> => undefined),
  insertRegistered: mock.fn(async (..._args: unknown[]) => undefined),
  setOtp: mock.fn(async (..._args: unknown[]) => undefined),
  verifyAndStartSession: mock.fn(async (..._args: unknown[]) => undefined),
  startSession: mock.fn(async (..._args: unknown[]) => undefined),
  setResetTokenByEmail: mock.fn(async (..._args: unknown[]) => undefined),
  resetPassword: mock.fn(async (..._args: unknown[]) => 1),
  insertInvited: mock.fn(async (..._args: unknown[]) => undefined),
  updateInvited: mock.fn(async (..._args: unknown[]) => undefined),
  setInviteResetToken: mock.fn(async (..._args: unknown[]) => undefined),
  updatePassword: mock.fn(async (..._args: unknown[]) => undefined),
  updateProfile: mock.fn(async (id: string, data: Record<string, unknown>) =>
    user({ id, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }),
  ),
  clearSession: mock.fn(async (_token: string | undefined) => undefined),
});

let users: ReturnType<typeof fakeUsers>;
let mail: ReturnType<typeof fakeMail>;
let recaptcha: ReturnType<typeof fakeRecaptcha>;
let service: AuthService;
const build = (recaptchaPasses = true) => {
  users = fakeUsers();
  mail = fakeMail();
  recaptcha = fakeRecaptcha(recaptchaPasses);
  service = new AuthService(as<UsersRepository>(users), mail.service, recaptcha.service, fakeConfig());
};
beforeEach(() => build());

describe("AuthService.register", () => {
  const valid = { email: " New@Example.com ", password: PASSWORD, fullName: " New ", phone: "9876543210", recaptchaToken: "t" };

  test("rejects a failed reCAPTCHA before anything else", async () => {
    build(false);
    await rejectsWith(service.register(valid), 400, "reCAPTCHA verification failed. Please try again.");
    assert.equal(recaptcha.verify.mock.calls[0].arguments[0], "t");
  });
  test("requires email and a 6+ character password", async () => {
    const message = "Email and password are required; password must be at least 6 characters.";
    await rejectsWith(service.register({ ...valid, email: "" }), 400, message);
    await rejectsWith(service.register({ ...valid, password: "12345" }), 400, message);
    await rejectsWith(service.register(undefined as never), 400, message);
  });
  test("requires a valid Indian mobile", async () => {
    await rejectsWith(service.register({ ...valid, phone: "5876543210" }), 400, "A valid 10-digit mobile number is required.");
    await rejectsWith(service.register({ ...valid, phone: undefined }), 400, "A valid 10-digit mobile number is required.");
  });
  test("409 when the phone is already registered", async () => {
    users.findIdByPhone.mock.mockImplementation(async () => ({ id: "x" }));
    await rejectsWith(service.register(valid), 409, "This mobile number is already registered.");
  });
  test("409 when the email is taken (unique constraint)", async () => {
    users.insertRegistered.mock.mockImplementation(async () => {
      throw Object.assign(new Error("dup"), { code: "P2002" });
    });
    await rejectsWith(service.register(valid), 409, "An account with this email already exists.");
  });
  test("other insert errors propagate", async () => {
    users.insertRegistered.mock.mockImplementation(async () => {
      throw new Error("db down");
    });
    await assert.rejects(service.register(valid), /db down/);
  });
  test("creates the user, issues an OTP and returns the public user", async () => {
    const result = await service.register(valid);
    const [id, email, fullName, phone, hash] = users.insertRegistered.mock.calls[0].arguments as string[];
    assert.equal(email, "New@Example.com");
    assert.equal(fullName, "New");
    assert.equal(phone, "9876543210");
    assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.deepEqual(result, { user: { id, email: "new@example.com", fullName: "New", phone: "9876543210", role: "user", photoUrl: null }, requiresOtp: true });
    await flush();
    assert.equal(users.setOtp.mock.callCount(), 1);
    assert.equal((mail.send.mock.calls[0].arguments[0] as { subject: string }).subject, "Your verification code");
  });
  test("a failing OTP email does not fail registration", async () => {
    mail.send.mock.mockImplementation(async () => {
      throw new Error("smtp");
    });
    const error = mock.method(console, "error", () => undefined);
    await service.register(valid);
    await flush();
    await flush();
    assert.match(String(error.mock.calls[0]?.arguments[0]), /otp email failed/);
    error.mock.restore();
  });
});

describe("AuthService.verifyOtp", () => {
  const pending = (overrides = {}) =>
    user({ id: "u-otp", email: "otp@example.com", isVerified: false, otpHash: hashOtp("123456"), otpExpiresAt: new Date(Date.now() + 60_000), ...overrides });

  test("requires an email and a 6-digit code", async () => {
    await rejectsWith(service.verifyOtp({ email: "otp@example.com", otpCode: "12" }), 400, "A valid 6-digit verification code is required.");
    await rejectsWith(service.verifyOtp({}), 400, "A valid 6-digit verification code is required.");
  });
  test("404 for an unknown account", async () => {
    await rejectsWith(service.verifyOtp({ email: "x@example.com", otpCode: "123456" }), 404, "Account not found.");
  });
  test("400 for a wrong or expired code", async () => {
    users.findByEmail.mock.mockImplementation(async () => pending());
    await rejectsWith(service.verifyOtp({ email: "otp@example.com", otpCode: "000000" }), 400, "Invalid or expired verification code.");
    users.findByEmail.mock.mockImplementation(async () => pending({ otpExpiresAt: new Date(Date.now() - 1000) }));
    await rejectsWith(service.verifyOtp({ email: "otp@example.com", otpCode: "123456" }), 400, "Invalid or expired verification code.");
  });
  test("starts a session and sends registration emails on first verification", async () => {
    users.findByEmail.mock.mockImplementation(async () => pending());
    users.findById.mock.mockImplementation(async () => pending({ isVerified: true }));
    const result = await service.verifyOtp({ email: " OTP@example.com ", otpCode: "123456" });
    assert.equal(users.findByEmail.mock.calls[0].arguments[0], "otp@example.com");
    assert.match(result.accessToken, /^[0-9a-f]{64}$/);
    assert.equal(users.verifyAndStartSession.mock.calls[0].arguments[1], sha256(result.accessToken), "only the hash is stored");
    await flush();
    await flush();
    const recipients = mail.send.mock.calls.map((call) => (call.arguments[0] as { to: string }).to);
    assert.deepEqual(recipients, ["otp@example.com", "admin@npsindore.org,info@npsindore.org"]);
  });
  test("no registration emails when already verified", async () => {
    users.findByEmail.mock.mockImplementation(async () => pending({ isVerified: true }));
    await service.verifyOtp({ email: "otp@example.com", otpCode: "123456" });
    await flush();
    assert.equal(mail.send.mock.callCount(), 0);
  });
});

describe("AuthService.resendOtp", () => {
  test("requires an email", async () => {
    await rejectsWith(service.resendOtp({}), 400, "Email is required.");
  });
  test("same response for unknown, unverified and verified accounts; OTP only for unverified", async () => {
    assert.deepEqual(await service.resendOtp({ email: "ghost@example.com" }), { ok: true });
    users.findByEmail.mock.mockImplementation(async () => user({ isVerified: true }));
    assert.deepEqual(await service.resendOtp({ email: "member@example.com" }), { ok: true });
    assert.equal(users.setOtp.mock.callCount(), 0);
    users.findByEmail.mock.mockImplementation(async () => user({ isVerified: false }));
    assert.deepEqual(await service.resendOtp({ email: "member@example.com" }), { ok: true });
    assert.equal(users.setOtp.mock.callCount(), 1);
  });
  test("email failures are swallowed", async () => {
    users.findByEmail.mock.mockImplementation(async () => user({ isVerified: false }));
    mail.send.mock.mockImplementation(async () => {
      throw new Error("smtp");
    });
    const error = mock.method(console, "error", () => undefined);
    assert.deepEqual(await service.resendOtp({ email: "member@example.com" }), { ok: true });
    error.mock.restore();
  });
});

describe("AuthService.login", () => {
  const account = () => user({ passwordHash: hashPassword(PASSWORD) });

  test("401 for unknown users and wrong passwords", async () => {
    await rejectsWith(service.login({ email: "x@example.com", password: PASSWORD }), 401, "Invalid email/phone or password.");
    users.findForLogin.mock.mockImplementation(async () => account());
    await rejectsWith(service.login({ email: "member@example.com", password: "wrong" }), 401, "Invalid email/phone or password.");
    await rejectsWith(service.login({ email: "member@example.com" }), 401, "Invalid email/phone or password.");
  });
  test("403 for unverified accounts", async () => {
    users.findForLogin.mock.mockImplementation(async () => user({ passwordHash: hashPassword(PASSWORD), isVerified: false }));
    await rejectsWith(service.login({ email: "member@example.com", password: PASSWORD }), 403, "Please verify your account before logging in.");
  });
  test("looks users up by email or normalized phone and starts a session", async () => {
    users.findForLogin.mock.mockImplementation(async () => account());
    const result = await service.login({ phone: " +91 98765 43210 ", password: PASSWORD });
    assert.deepEqual(users.findForLogin.mock.calls[0].arguments, ["+91 98765 43210", "9876543210"]);
    assert.deepEqual(result.user, { id: "u-1", email: "member@example.com", fullName: "Member", phone: "9876543210", role: "user", photoUrl: null });
    assert.equal(users.startSession.mock.calls[0].arguments[1], sha256(result.accessToken), "only the hash is stored");
    await service.login({ username: "member@example.com", password: PASSWORD });
    assert.deepEqual(users.findForLogin.mock.calls[1].arguments, ["member@example.com", "member@example.com"]);
  });
});

describe("AuthService password reset", () => {
  test("request: requires an email", async () => {
    await rejectsWith(service.requestPasswordReset({}), 400, "Email is required.");
  });
  test("request: unknown emails get the same response and no token", async () => {
    assert.deepEqual(await service.requestPasswordReset({ email: "ghost@example.com" }), { ok: true });
    assert.equal(users.setResetTokenByEmail.mock.callCount(), 0);
  });
  test("request: stores a hashed token and emails the link; mail errors are hidden", async () => {
    users.findIdByEmail.mock.mockImplementation(async () => ({ id: "u-1" }));
    mail.send.mock.mockImplementation(async () => {
      throw new Error("smtp");
    });
    const error = mock.method(console, "error", () => undefined);
    assert.deepEqual(await service.requestPasswordReset({ email: " Member@Example.com " }), { ok: true });
    error.mock.restore();
    const [email, tokenHash] = users.setResetTokenByEmail.mock.calls[0].arguments as string[];
    assert.equal(email, "member@example.com");
    const sent = mail.send.mock.calls[0].arguments[0] as { html: string };
    const token = decodeURIComponent(sent.html.match(/token=([^"]+)/)?.[1] ?? "");
    assert.equal(sha256(token), tokenHash);
  });
  test("confirm: validates input and the token", async () => {
    const message = "A valid reset token and password of at least 6 characters are required.";
    await rejectsWith(service.resetPassword({ resetToken: "t", newPassword: "123" }), 400, message);
    await rejectsWith(service.resetPassword({}), 400, message);
    users.resetPassword.mock.mockImplementation(async () => 0);
    await rejectsWith(service.resetPassword({ resetToken: "t", newPassword: "123456" }), 400, "This reset link is invalid or expired.");
  });
  test("confirm: sets the password for a valid token", async () => {
    assert.deepEqual(await service.resetPassword({ resetToken: "token", newPassword: "123456" }), { ok: true });
    assert.equal(users.resetPassword.mock.calls[0].arguments[1], sha256("token"));
  });
});

describe("AuthService.invite", () => {
  test("requires an email", async () => {
    await rejectsWith(service.invite({}), 400, "Email is required.");
  });
  test("creates a new invited user with the requested role", async () => {
    users.findById.mock.mockImplementation(async (id: string) => user({ id, email: "invitee@example.com", fullName: null }));
    const result = await service.invite({ email: " Invitee@Example.com ", role: "admin", phone: "9876543210" });
    const args = users.insertInvited.mock.calls[0].arguments;
    assert.equal(args[1], "invitee@example.com");
    assert.equal(args[5], "admin");
    assert.equal(result.username, "invitee@example.com");
    assert.match(result.password, /^NPS@[A-Za-z0-9_-]{8}!$/);
    assert.equal(users.setInviteResetToken.mock.callCount(), 1);
    const email = mail.send.mock.calls[0].arguments[0] as { to: string; text: string };
    assert.equal(email.to, "invitee@example.com");
    assert.match(email.text, new RegExp(result.password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  test("any role other than admin becomes user", async () => {
    await service.invite({ email: "a@example.com", role: "superuser" });
    assert.equal(users.insertInvited.mock.calls[0].arguments[5], "user");
  });
  test("re-invites an existing user, keeping known details", async () => {
    users.findByEmail.mock.mockImplementation(async () => user({ id: "u-9", fullName: "Old Name", phone: "9000000000" }));
    users.findById.mock.mockImplementation(async () => user({ id: "u-9", email: null, phone: "9000000000" }));
    const result = await service.invite({ email: "member@example.com" });
    assert.deepEqual(users.updateInvited.mock.calls[0].arguments.slice(0, 3), ["u-9", "Old Name", "9000000000"]);
    assert.equal(result.username, "9000000000");
  });
  test("mail failures don't fail the invite", async () => {
    mail.send.mock.mockImplementation(async () => {
      throw new Error("smtp");
    });
    const error = mock.method(console, "error", () => undefined);
    assert.equal((await service.invite({ email: "a@example.com" })).ok, true);
    error.mock.restore();
  });
});

describe("AuthService password change, me and logout", () => {
  const me = () => user({ passwordHash: hashPassword(PASSWORD) });

  test("change: validates the new and current passwords", async () => {
    await rejectsWith(service.changePassword(me(), { currentPassword: PASSWORD, newPassword: "123" }), 400, "New password must be at least 6 characters.");
    await rejectsWith(service.changePassword(me(), { currentPassword: "wrong", newPassword: "123456" }), 401, "Current password is incorrect.");
    await rejectsWith(service.changePassword(me(), { newPassword: "123456" }), 401, "Current password is incorrect.");
  });
  test("change: stores a new hash", async () => {
    assert.deepEqual(await service.changePassword(me(), { currentPassword: PASSWORD, newPassword: "123456" }), { ok: true });
    assert.equal(users.updatePassword.mock.calls[0].arguments[0], "u-1");
  });
  test("me returns only public fields", () => {
    assert.deepEqual(service.me(user({ passwordHash: "x", sessionToken: "y" })), {
      id: "u-1",
      email: "member@example.com",
      fullName: "Member",
      phone: "9876543210",
      role: "user",
      photoUrl: null,
    });
  });
  test("logout clears the session for the given token", async () => {
    await service.logout("tok");
    assert.equal(users.clearSession.mock.calls[0].arguments[0], sha256("tok"));
  });
  test("logout without a token touches nothing", async () => {
    await service.logout(undefined);
    await service.logout("");
    assert.equal(users.clearSession.mock.callCount(), 0);
  });
});

describe("AuthService.updateMe", () => {
  const photo = "https://api.npsindore.org/uploads/0b6e2f1a-1111-4c2b-9c3d-123456789abc.png";
  test("updates name, mobile and photo; returns the public user with the photo", async () => {
    const me = await service.updateMe(user({ id: "u-1" }), { fullName: " Ram Patidar ", phone: "9876500001", photoUrl: photo });
    assert.deepEqual([me.fullName, me.phone, me.photoUrl], ["Ram Patidar", "9876500001", photo]);
    assert.deepEqual(users.updateProfile.mock.calls[0].arguments, ["u-1", { fullName: "Ram Patidar", phone: "9876500001", photoUrl: photo }]);
  });
  test("omitted fields are left alone; empty values clear them", async () => {
    await service.updateMe(user({ id: "u-1" }), { photoUrl: "" });
    assert.deepEqual(users.updateProfile.mock.calls[0].arguments[1], { fullName: undefined, phone: undefined, photoUrl: null });
  });
  test("rejects a bad mobile, someone else's mobile, outside images and markup", async () => {
    await rejectsWith(service.updateMe(user(), { phone: "12345" }), 400, "A valid 10-digit mobile number is required.");
    users.findIdByPhone.mock.mockImplementation(async () => ({ id: "someone-else" }));
    await rejectsWith(service.updateMe(user({ id: "u-1" }), { phone: "9876500001" }), 409, "This mobile number is already registered.");
    users.findIdByPhone.mock.mockImplementation(async () => ({ id: "u-1" }));
    await service.updateMe(user({ id: "u-1" }), { phone: "9876500001" });
    await rejectsWith(service.updateMe(user(), { photoUrl: "https://evil.example/track.png" }), 400, "The photo must be an image uploaded to the portal.");
    await rejectsWith(
      service.updateMe(user(), { photoUrl: "https://api.npsindore.org/uploads/../etc/passwd" }),
      400,
      "The photo must be an image uploaded to the portal.",
    );
    await rejectsWith(service.updateMe(user(), { fullName: "<script>" }), 400, 'The "fullName" field cannot contain < or > characters.');
  });
});
