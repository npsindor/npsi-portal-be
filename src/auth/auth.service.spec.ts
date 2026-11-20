import assert from "node:assert/strict";
import { beforeEach, describe, mock, test } from "node:test";
import { hashOtp, hashPassword, sha256 } from "../common/utils/crypto.js";
import { as, fakeConfig, fakeMail, fakeRecaptcha, flush, rejectsWith, user } from "../testing/fakes.js";
import { AuthService } from "./auth.service.js";
import type { MobileOtpService } from "./mobile-otp.service.js";
import type { UsersRepository } from "./users.repository.js";

const PASSWORD = "secret12";

type Account = { type: string; status: string; familyId: string | null; studentId: string | null; dual: boolean };
const NO_REGISTRATION: Account = { type: "NONE", status: "NONE", familyId: null, studentId: null, dual: false };
const fakeUsers = () => ({
  loginAccount: mock.fn(async (_user: unknown): Promise<Account> => NO_REGISTRATION),
  findById: mock.fn(async (id: string) => user({ id, email: "new@example.com", fullName: "New", isVerified: false })),
  findIdByPhone: mock.fn(async (_phone: string): Promise<{ id: string } | undefined> => undefined),
  findByEmail: mock.fn(async (_email: string): Promise<ReturnType<typeof user> | undefined> => undefined),
  findIdByEmail: mock.fn(async (_email: string): Promise<{ id: string } | undefined> => undefined),
  findForLogin: mock.fn(async (_identifier: string, _phone: string): Promise<ReturnType<typeof user> | undefined> => undefined),
  insertRegistered: mock.fn(async (..._args: unknown[]) => undefined),
  setOtp: mock.fn(async (..._args: unknown[]) => undefined),
  verifyAndStartSession: mock.fn(async (..._args: unknown[]) => undefined),
  startSession: mock.fn(async (..._args: unknown[]) => undefined),
  setResetTokenByEmail: mock.fn(async (..._args: unknown[]) => true),
  resetPassword: mock.fn(async (..._args: unknown[]) => 1),
  insertInvited: mock.fn(async (..._args: unknown[]) => undefined),
  updateInvited: mock.fn(async (..._args: unknown[]) => undefined),
  setInviteResetToken: mock.fn(async (..._args: unknown[]) => undefined),
  updatePassword: mock.fn(async (..._args: unknown[]) => undefined),
  updateProfile: mock.fn(async (id: string, data: Record<string, unknown>) =>
    user({ id, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }),
  ),
  clearSession: mock.fn(async (_token: string | undefined) => undefined),
  clearAllSessions: mock.fn(async (..._args: unknown[]) => undefined),
  findByPhone: mock.fn(async (_phone: string): Promise<ReturnType<typeof user> | null> => null),
  insertMobileRegistered: mock.fn(async (..._args: unknown[]) => undefined),
  resetPasswordFor: mock.fn(async (..._args: unknown[]) => undefined),
  markVerified: mock.fn(async (..._args: unknown[]) => undefined),
  adminAccess: mock.fn(async (..._args: unknown[]) => null),
});
const fakeMobileOtp = () => ({
  send: mock.fn(async (..._args: unknown[]) => ({ channel: "WHATSAPP", expiresInSeconds: 600 })),
  verify: mock.fn(async (..._args: unknown[]) => "verification-token"),
  consume: mock.fn(async (_mobile: string, _purpose: string, token: string | undefined) => {
    if (token === "email-verification-token") return false; // the code went to the fallback email
    if (token !== "verification-token") throw Object.assign(new Error("expired"), { getStatus: () => 400 });
    return true;
  }),
});
let mobileOtp: ReturnType<typeof fakeMobileOtp>;

let users: ReturnType<typeof fakeUsers>;
let mail: ReturnType<typeof fakeMail>;
let recaptcha: ReturnType<typeof fakeRecaptcha>;
let service: AuthService;
const build = (recaptchaPasses = true) => {
  users = fakeUsers();
  mail = fakeMail();
  recaptcha = fakeRecaptcha(recaptchaPasses);
  mobileOtp = fakeMobileOtp();
  service = new AuthService(as<UsersRepository>(users), mail.service, recaptcha.service, fakeConfig(), as<MobileOtpService>(mobileOtp));
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
    const message = "Email and password are required; password must be at least 8 characters.";
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
  test("an unknown account gets the same 400 as a wrong code (no account probing)", async () => {
    await rejectsWith(service.verifyOtp({ email: "x@example.com", otpCode: "123456" }), 400, "Invalid or expired verification code.");
  });
  test("reCAPTCHA is checked once the input is valid", async () => {
    recaptcha.verify.mock.mockImplementation(async () => false);
    await rejectsWith(service.verifyOtp({ email: "otp@example.com", otpCode: "123456" }), 400, "reCAPTCHA verification failed. Please try again.");
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
  test("a non-string password is a plain 401 for existing and unknown accounts (no 500 that reveals the account)", async () => {
    const odd = { email: "member@example.com", password: true } as unknown as Parameters<typeof service.login>[0];
    await rejectsWith(service.login(odd), 401, "Invalid email/phone or password.");
    users.findForLogin.mock.mockImplementation(async () => account());
    await rejectsWith(service.login(odd), 401, "Invalid email/phone or password.");
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
    assert.deepEqual(result.account, { type: "NONE", status: "NONE" });
  });
  test("administrators finish with an emailed code: no session from the password alone", async () => {
    const withCode = new AuthService(
      as<UsersRepository>(users),
      mail.service,
      recaptcha.service,
      fakeConfig({ adminLoginCode: true }),
      as<MobileOtpService>(mobileOtp),
    );
    users.findForLogin.mock.mockImplementation(async () => user({ role: "admin", email: "admin@npsindore.org", passwordHash: hashPassword(PASSWORD) }));
    await rejectsWith(
      withCode.login({ email: "admin@npsindore.org", password: PASSWORD }),
      403,
      "Enter the sign-in code sent to your email to finish logging in.",
    );
    assert.equal(users.startSession.mock.callCount(), 0);
    assert.equal(users.setOtp.mock.callCount(), 1);
    assert.equal((mail.send.mock.calls[0].arguments[0] as { subject: string }).subject, "Your administrator sign-in code");
    users.findForLogin.mock.mockImplementation(async () => user({ role: "admin", email: null, passwordHash: hashPassword(PASSWORD) }));
    await rejectsWith(withCode.login({ phone: "9876543210", password: PASSWORD }), 403, /need an email address/);
    // A member is not affected.
    users.findForLogin.mock.mockImplementation(async () => account());
    assert.ok((await withCode.login({ email: "member@example.com", password: PASSWORD })).accessToken);
  });
  test("a mail server that refuses the admin's code is a clear 503, not a 500", async () => {
    const withCode = new AuthService(
      as<UsersRepository>(users),
      mail.service,
      recaptcha.service,
      fakeConfig({ adminLoginCode: true }),
      as<MobileOtpService>(mobileOtp),
    );
    users.findForLogin.mock.mockImplementation(async () => user({ role: "admin", email: "admin@npsindore.org", passwordHash: hashPassword(PASSWORD) }));
    mail.send.mock.mockImplementation(async () => {
      throw new Error("Mail command failed: 553 5.7.1 Sender address rejected");
    });
    const logged = mock.method(console, "error", () => undefined);
    await rejectsWith(withCode.login({ email: "admin@npsindore.org", password: PASSWORD }), 503, "The sign-in code could not be sent. Please try again later.");
    assert.equal(users.startSession.mock.callCount(), 0, "still no session without the code");
    logged.mock.restore();
  });
  test("the admin's code can be entered with the mobile they logged in with", async () => {
    const pendingAdmin = user({ role: "admin", email: "admin@npsindore.org", otpHash: hashOtp("123456"), otpExpiresAt: new Date(Date.now() + 60_000) });
    users.findByPhone.mock.mockImplementation(async () => pendingAdmin);
    assert.ok((await service.verifyOtp({ email: "9876543210", otpCode: "123456" })).accessToken);
    assert.deepEqual(users.findByPhone.mock.calls[0].arguments, ["9876543210"]);
  });

  const as_ = (type: string, status = "ACTIVE") => {
    users.findForLogin.mock.mockImplementation(async () => account());
    users.loginAccount.mock.mockImplementation(async () => ({ ...NO_REGISTRATION, type, status }));
  };
  const FAMILY_MSG = "Your account is registered as an NPS Family Member. Please use Family Member Login to access your account.";
  const STUDENT_MSG = "Your account is registered as an NPS Student. Please use Student Login to access your account.";

  test("a Family Member account logs in through Family Member Login only", async () => {
    as_("FAMILY");
    assert.deepEqual((await service.login({ email: "member@example.com", password: PASSWORD, portal: "FAMILY" })).account, {
      type: "FAMILY",
      status: "ACTIVE",
    });
    await rejectsWith(service.login({ email: "member@example.com", password: PASSWORD, portal: "STUDENT" }), 403, FAMILY_MSG);
    assert.equal(users.startSession.mock.callCount(), 1, "no session for the refused portal");
  });
  test("a Student account logs in through Student Login only; no portal means Family Member Login", async () => {
    as_("STUDENT");
    assert.equal((await service.login({ email: "member@example.com", password: PASSWORD, portal: "student" })).account?.type, "STUDENT");
    await rejectsWith(service.login({ email: "member@example.com", password: PASSWORD, portal: "FAMILY" }), 403, STUDENT_MSG);
    await rejectsWith(service.login({ email: "member@example.com", password: PASSWORD }), 403, STUDENT_MSG);
  });
  test("a wrong password stays a generic 401 whatever the account is", async () => {
    as_("FAMILY");
    await rejectsWith(service.login({ email: "member@example.com", password: "wrong", portal: "STUDENT" }), 401, "Invalid email/phone or password.");
    assert.equal(users.loginAccount.mock.callCount(), 0, "the account type is not even looked up");
  });
  test("an account without any registration may use either portal; pending and rejected may sign in to see their status", async () => {
    as_("NONE", "NONE");
    await service.login({ email: "member@example.com", password: PASSWORD, portal: "STUDENT" });
    await service.login({ email: "member@example.com", password: PASSWORD, portal: "FAMILY" });
    as_("STUDENT", "PENDING");
    assert.equal((await service.login({ email: "member@example.com", password: PASSWORD, portal: "STUDENT" })).account?.status, "PENDING");
    as_("FAMILY", "REJECTED");
    assert.equal((await service.login({ email: "member@example.com", password: PASSWORD, portal: "FAMILY" })).account?.status, "REJECTED");
  });
  test("suspended or inactive memberships and disabled accounts are refused", async () => {
    as_("FAMILY", "SUSPENDED");
    await rejectsWith(
      service.login({ email: "member@example.com", password: PASSWORD }),
      403,
      "Your NPS family membership is suspended. Please contact the NPS Indore office.",
    );
    as_("STUDENT", "INACTIVE");
    await rejectsWith(
      service.login({ email: "member@example.com", password: PASSWORD, portal: "STUDENT" }),
      403,
      "Your NPS student registration is inactive. Please contact the NPS Indore office.",
    );
    as_("NONE", "NONE");
    users.findForLogin.mock.mockImplementation(async () => user({ passwordHash: hashPassword(PASSWORD), status: "suspended" }));
    await rejectsWith(
      service.login({ email: "member@example.com", password: PASSWORD }),
      403,
      "This account is not active. Please contact the NPS Indore office.",
    );
  });
  test("administrators sign in through Family Member Login", async () => {
    as_("ADMIN");
    await service.login({ email: "member@example.com", password: PASSWORD });
    await rejectsWith(
      service.login({ email: "member@example.com", password: PASSWORD, portal: "STUDENT" }),
      403,
      "Administrator accounts sign in through Family Member Login.",
    );
  });
  test("the emailed-code sign-in applies the same portal rule", async () => {
    users.findByEmail.mock.mockImplementation(async () => user({ otpHash: hashOtp("123456"), otpExpiresAt: new Date(Date.now() + 60_000) }));
    users.loginAccount.mock.mockImplementation(async () => ({ ...NO_REGISTRATION, type: "FAMILY", status: "ACTIVE" }));
    await rejectsWith(service.verifyOtp({ email: "member@example.com", otpCode: "123456", portal: "STUDENT" }), 403, FAMILY_MSG);
    assert.equal(users.verifyAndStartSession.mock.callCount(), 0);
    assert.equal((await service.verifyOtp({ email: "member@example.com", otpCode: "123456", portal: "FAMILY" })).account?.type, "FAMILY");
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
  test("request: no second email while a recent link is still fresh", async () => {
    users.findIdByEmail.mock.mockImplementation(async () => ({ id: "u-1" }));
    users.setResetTokenByEmail.mock.mockImplementation(async () => false);
    assert.deepEqual(await service.requestPasswordReset({ email: "member@example.com" }), { ok: true });
    assert.equal(mail.send.mock.callCount(), 0);
  });
  test("confirm: validates input and the token", async () => {
    const message = "A valid reset token and password of at least 8 characters are required.";
    await rejectsWith(service.resetPassword({ resetToken: "t", newPassword: "123" }), 400, message);
    await rejectsWith(service.resetPassword({}), 400, message);
    users.resetPassword.mock.mockImplementation(async () => 0);
    await rejectsWith(service.resetPassword({ resetToken: "t", newPassword: "Garba#2026" }), 400, "This reset link is invalid or expired.");
  });
  test("confirm: sets the password for a valid token", async () => {
    assert.deepEqual(await service.resetPassword({ resetToken: "token", newPassword: "Garba#2026" }), { ok: true });
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
    assert.match(result.password as string, /^NPS@[A-Za-z0-9_-]{8}!$/);
    assert.equal(users.setInviteResetToken.mock.callCount(), 1);
    const email = mail.send.mock.calls[0].arguments[0] as { to: string; text: string };
    assert.equal(email.to, "invitee@example.com");
    assert.match(email.text, new RegExp((result.password as string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
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
  test("an account with its own password keeps it on approval and is told to use it", async () => {
    users.findByEmail.mock.mockImplementation(async () => user({ id: "u-9", passwordHash: hashPassword(PASSWORD), status: "active" }));
    const result = await service.invite({ email: "member@example.com", phone: "9876543210" }, "student");
    assert.equal(result.password, null);
    assert.equal(users.updateInvited.mock.callCount(), 0);
    assert.equal(users.insertInvited.mock.callCount(), 0);
    const email = mail.send.mock.calls[0].arguments[0] as { text: string; subject: string };
    assert.doesNotMatch(email.text, /Temporary Password/);
    assert.match(email.text, /स्टूडेंट पंजीकरण/);
  });
  test("a mobile that belongs to another account is not copied onto the invited one", async () => {
    users.findIdByPhone.mock.mockImplementation(async () => ({ id: "someone-else" }));
    await service.invite({ email: "new@example.com", phone: "9876543210" });
    assert.equal(users.insertInvited.mock.calls[0].arguments[3], undefined);
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
    await rejectsWith(service.changePassword(me(), { currentPassword: PASSWORD, newPassword: "123" }), 400, "New password must be at least 8 characters.");
    await rejectsWith(
      service.changePassword(me(), { currentPassword: PASSWORD, newPassword: "Password123" }),
      400,
      "This password is too common and easy to guess. Choose a different one.",
    );
    await rejectsWith(service.changePassword(me(), { currentPassword: "wrong", newPassword: "Garba#2026" }), 401, "Current password is incorrect.");
    await rejectsWith(service.changePassword(me(), { newPassword: "Garba#2026" }), 401, "Current password is incorrect.");
    await rejectsWith(
      service.changePassword(me(), { currentPassword: PASSWORD, newPassword: PASSWORD }),
      400,
      "The new password must be different from the current one.",
    );
    const numeric = { currentPassword: PASSWORD, newPassword: 12345678 } as unknown as Parameters<typeof service.changePassword>[1];
    await rejectsWith(service.changePassword(me(), numeric), 400, "New password must be at least 8 characters.");
  });
  test("change: stores a new hash", async () => {
    assert.deepEqual(await service.changePassword(me(), { currentPassword: PASSWORD, newPassword: "Garba#2026" }), { ok: true });
    assert.equal(users.updatePassword.mock.calls[0].arguments[0], "u-1");
  });
  test("me returns only public fields, plus the account's portal and admin access", async () => {
    assert.deepEqual(await service.me(user({ passwordHash: "x", sessionToken: "y" })), {
      account: { type: "NONE", status: "NONE" },
      adminAccess: null,
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
    const me = await service.updateMe(user({ id: "u-1" }), {
      fullName: " Ram Patidar ",
      phone: "9876500001",
      phoneVerificationToken: "verification-token",
      photoUrl: photo,
    });
    assert.deepEqual([me.fullName, me.phone, me.photoUrl], ["Ram Patidar", "9876500001", photo]);
    assert.deepEqual(users.updateProfile.mock.calls[0].arguments, [
      "u-1",
      { fullName: "Ram Patidar", phone: "9876500001", phoneVerified: true, photoUrl: photo },
    ]);
  });
  test("omitted fields are left alone; empty values clear them", async () => {
    await service.updateMe(user({ id: "u-1" }), { photoUrl: "" });
    assert.deepEqual(users.updateProfile.mock.calls[0].arguments[1], { fullName: undefined, phone: undefined, phoneVerified: undefined, photoUrl: null });
  });
  test("a new mobile must be verified with its code; keeping the current one needs nothing", async () => {
    await rejectsWith(service.updateMe(user({ id: "u-1" }), { phone: "9000000077" }), 400, "Verify the new mobile number with the code sent to it.");
    await rejectsWith(service.updateMe(user({ id: "u-1" }), { phone: "9000000077", phoneVerificationToken: "stolen" }), 400, /(?:)/);
    assert.equal(users.updateProfile.mock.callCount(), 0);
    await service.updateMe(user({ id: "u-1" }), { phone: "9000000077", phoneVerificationToken: "verification-token" });
    assert.deepEqual(mobileOtp.consume.mock.calls.at(-1)?.arguments, ["9000000077", "REGISTER", "verification-token"]);
    await service.updateMe(user({ id: "u-1", phone: "+91 98765 43210" }), { phone: "9876543210", fullName: "Same" });
    assert.equal(mobileOtp.consume.mock.callCount(), 2);
  });
  test("rejects a bad mobile, someone else's mobile, outside images and markup", async () => {
    await rejectsWith(service.updateMe(user(), { phone: "12345" }), 400, "A valid 10-digit mobile number is required.");
    users.findIdByPhone.mock.mockImplementation(async () => ({ id: "someone-else" }));
    await rejectsWith(service.updateMe(user({ id: "u-1" }), { phone: "9876500001" }), 409, "This mobile number is already registered.");
    users.findIdByPhone.mock.mockImplementation(async () => ({ id: "u-1" }));
    await service.updateMe(user({ id: "u-1", phone: "9876500001" }), { phone: "9876500001" });
    await rejectsWith(service.updateMe(user(), { photoUrl: "https://evil.example/track.png" }), 400, "The photo must be an image uploaded to the portal.");
    await rejectsWith(
      service.updateMe(user(), { photoUrl: "https://api.npsindore.org/uploads/../etc/passwd" }),
      400,
      "The photo must be an image uploaded to the portal.",
    );
    await rejectsWith(service.updateMe(user(), { fullName: "<script>" }), 400, 'The "fullName" field cannot contain < or > characters.');
  });
});

describe("AuthService sessions across devices", () => {
  test("changing the password keeps the current device's session (by its hash)", async () => {
    await service.changePassword(user({ passwordHash: hashPassword(PASSWORD) }), { currentPassword: PASSWORD, newPassword: "NewPass1" }, "this-device-token");
    const [, , keep] = users.updatePassword.mock.calls[0].arguments;
    assert.equal(keep, sha256("this-device-token"));
  });
  test("log out everywhere ends all of the user's sessions", async () => {
    await service.logoutEverywhere(user({ id: "u-9" }));
    assert.deepEqual(users.clearAllSessions.mock.calls[0].arguments, ["u-9"]);
  });
});

describe("AuthService mobile registration and reset", () => {
  test("registration OTP: rejects a taken mobile, sends otherwise", async () => {
    users.findIdByPhone.mock.mockImplementationOnce(async () => ({ id: "u-1" }));
    await rejectsWith(service.requestMobileOtp({ mobile: "9876543210" }), 409, "This mobile number is already registered.");
    const result = await service.requestMobileOtp({ mobile: "+91 98765 43210", email: "A@Example.com" });
    assert.deepEqual(result, { ok: true, channel: "WHATSAPP", expiresInSeconds: 600 });
    assert.deepEqual(mobileOtp.send.mock.calls[0].arguments, ["9876543210", "REGISTER", "a@example.com"]);
  });
  test("registration OTP: invalid mobile and failed reCAPTCHA are rejected", async () => {
    await rejectsWith(service.requestMobileOtp({ mobile: "12345" }), 400, "A valid 10-digit mobile number is required.");
    build(false);
    await assert.rejects(service.requestMobileOtp({ mobile: "9876543210" }));
  });
  test("reset OTP: same answer for unknown numbers and nothing is sent", async () => {
    assert.equal((await service.requestMobileOtp({ mobile: "9876543210", purpose: "RESET" })).ok, true);
    assert.equal(mobileOtp.send.mock.callCount(), 0);
  });
  test("mobile registration creates a verified account and starts a session", async () => {
    await rejectsWith(
      service.registerWithMobile({ phone: "9876543210", verificationToken: "verification-token", password: "123" }),
      400,
      "Password must be at least 8 characters.",
    );
    users.findById.mock.mockImplementation(async (id: string) => user({ id, email: null, phone: "9876543210" }));
    const session = await service.registerWithMobile({ phone: "9876543210", verificationToken: "verification-token", password: PASSWORD });
    assert.ok(session.accessToken);
    const args = users.insertMobileRegistered.mock.calls[0].arguments;
    assert.deepEqual(args.slice(1, 4), [null, null, "9876543210"]);
    assert.equal(users.startSession.mock.callCount(), 1);
  });
  test("a code that went to the fallback email proves the email, not the mobile: the number is stored unverified", async () => {
    users.findById.mock.mockImplementation(async (id: string) => user({ id, email: "new@example.com", phone: "9876543210" }));
    await rejectsWith(
      service.registerWithMobile({ phone: "9876543210", verificationToken: "email-verification-token", password: PASSWORD }),
      400,
      "Enter the email the verification code was sent to.",
    );
    await service.registerWithMobile({ phone: "9876543210", email: "new@example.com", verificationToken: "email-verification-token", password: PASSWORD });
    assert.equal(users.insertMobileRegistered.mock.calls[0].arguments[5], false);
    await service.registerWithMobile({ phone: "9876543210", verificationToken: "verification-token", password: PASSWORD });
    assert.equal(users.insertMobileRegistered.mock.calls[1].arguments[5], true, "WhatsApp / SMS proves the mobile");
  });
  test("common passwords are refused", async () => {
    await rejectsWith(
      service.registerWithMobile({ phone: "9876543210", verificationToken: "verification-token", password: "Password@123" }),
      400,
      "This password is too common and easy to guess. Choose a different one.",
    );
  });
  test("mobile registration needs a valid verification token", async () => {
    await assert.rejects(service.registerWithMobile({ phone: "9876543210", verificationToken: "forged", password: PASSWORD }));
    assert.equal(users.insertMobileRegistered.mock.callCount(), 0);
  });
  test("mobile password reset sets the password and logs out every device", async () => {
    users.findByPhone.mock.mockImplementation(async () => user({ id: "u-7" }));
    assert.deepEqual(await service.resetPassword({ phone: "9876543210", verificationToken: "verification-token", newPassword: "newpass1" }), { ok: true });
    assert.equal(users.resetPasswordFor.mock.calls[0].arguments[0], "u-7");
  });
  test("login of an unverified account sends a new code and answers 403", async () => {
    users.findForLogin.mock.mockImplementation(async () => user({ isVerified: false, passwordHash: hashPassword(PASSWORD) }));
    await rejectsWith(service.login({ email: "member@example.com", password: PASSWORD }), 403, "Please verify your account before logging in.");
    await flush();
    assert.equal(users.setOtp.mock.callCount(), 1);
  });
});

describe("AuthService reCAPTCHA on the public forms", () => {
  test("login, resend code, password reset by email and by mobile all need a passing token", async () => {
    const FAILED = "reCAPTCHA verification failed. Please try again.";
    build(false);
    await rejectsWith(service.login({ email: "a@example.com", password: PASSWORD }), 400, FAILED);
    await rejectsWith(service.resendOtp({ email: "a@example.com" }), 400, FAILED);
    await rejectsWith(service.requestPasswordReset({ email: "a@example.com" }), 400, FAILED);
    await rejectsWith(service.requestMobileOtp({ mobile: "9876543210", purpose: "RESET" }), 400, FAILED);
    assert.equal(users.findForLogin.mock.callCount(), 0, "credentials are not checked before the token");
  });
});

describe("AuthService.currentSession", () => {
  test("null without a user; the same view as me() with one", async () => {
    build();
    assert.deepEqual(await service.currentSession(null), { user: null });
    const current = await service.currentSession(user());
    assert.deepEqual(current.user, await service.me(user()));
  });
});
