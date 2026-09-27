import "./env.js";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QueryTypes } from "sequelize";
import { query, sequelize } from "./db.js";
import { getTable, quoteIdentifier } from "./entityConfig.js";
import { sendMail } from "./mailer.js";
import { memberWelcomeEmail, memberInviteEmail, adminNewRegistrationEmail, adminNewApplicationEmail } from "./emailTemplates.js";

const adminEmails = (process.env.ADMIN_NOTIFICATION_EMAILS || "info@npsindore.org,npsindor@gmail.com")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);
const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const app = express();
const port = Number(process.env.API_PORT || 4000);
// Behind Hostinger's reverse proxy, the raw request always looks like plain
// HTTP to Express — without this, request.protocol below would build
// http:// upload URLs for a site served over https, which browsers block as
// mixed content.
app.set("trust proxy", true);
// Reflects only origins that are actually this project's own frontend(s) —
// the live domain and any of its subdomains, the Hostinger preview domain
// (which has changed once already this project), and local dev — instead of
// the previous "reflect literally any origin" configuration.
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+\.)*npsindore\.org$|^https:\/\/([a-z0-9-]+\.)*hostingersite\.com$|^http:\/\/localhost(:\d+)?$/i;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGIN_PATTERN.test(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "2mb" }));

// Throttles brute-force/enumeration attempts against auth endpoints (login
// password guessing, OTP guessing, password-reset spam) without needing a
// per-account lockout system. IPv4/IPv6 aware via express-rate-limit's default
// keyGenerator.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
// /api/verify/:familyId and /api/track/application are intentionally public
// (QR-code membership cards, "track my application" lookups) and return real
// PII on a match. Without this, anyone could script through every sequential
// NPSI-FAM-/NPSI-APP- ID and bulk-scrape every family's head name, city and
// members' names/genders. This keeps normal one-off lookups working while
// making that kind of bulk scraping impractical.
const publicLookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });

// Photo uploads (family/student registration photos, event banners, feedback
// attachments) — this is a public, unauthenticated endpoint (registration
// happens before any account/session exists), so it's deliberately narrow:
// only real image bytes, a small size cap, and a server-generated filename.
// The client's filename/extension is never trusted or used for anything —
// that's what would open path traversal or "upload a .php disguised as
// .jpg" style attacks.
// UPLOADS_DIR should point somewhere outside the deployed code folder in
// production (e.g. a sibling of hbuilds/config, not inside
// hbuilds/versions/<hash>) — each redeploy replaces the versioned code
// folder entirely, which would silently delete every uploaded photo if it
// lived alongside server/index.js. Defaults to a local ./uploads folder,
// which is fine for local dev only.
const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(backendRoot, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const UPLOAD_MIME_EXTENSIONS = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const upload = multer({
  storage: multer.diskStorage({
    destination: (request, file, callback) => callback(null, uploadsDir),
    filename: (request, file, callback) => callback(null, `${crypto.randomUUID()}${UPLOAD_MIME_EXTENSIONS[file.mimetype] || ""}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (request, file, callback) => {
    if (!UPLOAD_MIME_EXTENSIONS[file.mimetype]) return callback(new Error("Only JPEG, PNG, WEBP or GIF images are allowed."));
    callback(null, true);
  },
});
app.use("/uploads", express.static(uploadsDir, { maxAge: "7d", index: false }));

const passwordKey = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
const hashPassword = (password) => { const salt = crypto.randomBytes(16).toString("hex"); return `${salt}:${passwordKey(password, salt)}`; };
const verifyPassword = (password, stored) => {
  if (!stored?.includes(":")) return false;
  const [salt, hash] = stored.split(":"); const expected = Buffer.from(passwordKey(password, salt), "hex"); const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};
const createToken = () => crypto.randomBytes(32).toString("hex");
const publicUser = (user) => ({ id: user.id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role });
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const hashOtp = (code) => crypto.createHash("sha256").update(String(code)).digest("hex");
const safeEqual = (a, b) => { const bufA = Buffer.from(String(a)); const bufB = Buffer.from(String(b)); return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB); };
// Generates a fresh single-use, time-boxed OTP for a user and emails it —
// this replaces a previous hardcoded "123456" code that anyone could use to
// take over any account (including admin) just by knowing its email address.
const issueOtp = async (user) => {
  const code = generateOtp();
  await query("UPDATE users SET otp_hash = ?, otp_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE), updated_at = NOW() WHERE id = ?", [hashOtp(code), user.id]);
  await sendMail({
    to: user.email,
    subject: "Your verification code",
    html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p><p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
};
const sendRegistrationEmails = async (user) => {
  const name = user.full_name || user.email.split("@")[0];
  const loginUrl = `${frontendUrl}/login`;
  const welcome = memberWelcomeEmail({ name, loginUrl });
  await sendMail({ to: user.email, subject: welcome.subject, html: welcome.html, text: welcome.text });
  const registeredAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const admin = adminNewRegistrationEmail({ name, email: user.email, phone: user.phone, registeredAt });
  await sendMail({ to: adminEmails.join(","), subject: admin.subject, html: admin.html, text: admin.text });
};
const sendApplicationEmails = async (application) => {
  const name = application.family_head_name || "Member";
  const loginUrl = `${frontendUrl}/login`;
  if (application.email) {
    const welcome = memberWelcomeEmail({ name, loginUrl });
    await sendMail({ to: application.email, subject: welcome.subject, html: welcome.html, text: welcome.text });
  }
  const registeredAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const admin = adminNewApplicationEmail({
    name,
    email: application.email,
    phone: application.mobile,
    applicationId: application.application_id,
    familyName: application.family_name,
    city: application.city,
    registeredAt,
  });
  await sendMail({ to: adminEmails.join(","), subject: admin.subject, html: admin.html, text: admin.text });
};
const rows = async (sql, replacements = []) => query(sql, replacements, { type: QueryTypes.SELECT });
const normalizeMobile = (value) => String(value || "").replace(/\D/g, "").slice(-10);
const toMoneyNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};
const toMySqlDateTime = (value) => {
  if (value == null || value === "") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace("T", " ");
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (!/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(trimmed)) return value;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 19).replace("T", " ");
};
const DATE_FIELD_PATTERN = /^(dob|date|.*_date|.*_at|registration_open|registration_close)$/i;
const sanitizeDateValues = (value, key) => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeDateValues(entry, key));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, sanitizeDateValues(entry, entryKey)]));
  }
  if (typeof value === "string") {
    if (DATE_FIELD_PATTERN.test(key || "") && !value.trim()) return null;
    return toMySqlDateTime(value);
  }
  return value;
};
const isMobileTaken = async (mobile, excludeApplicationId) => {
  const target = normalizeMobile(mobile);
  if (!target) return false;
  const [apps, fams, members] = await Promise.all([
    rows("SELECT id, mobile, status FROM applications"),
    rows("SELECT contact_number FROM families"),
    rows("SELECT mobile FROM family_members"),
  ]);
  const candidates = [
    ...apps.filter((a) => a.status !== "REJECTED" && a.id !== excludeApplicationId).map((a) => a.mobile),
    ...fams.map((f) => f.contact_number),
    ...members.map((m) => m.mobile),
  ];
  return candidates.some((value) => normalizeMobile(value) === target);
};
const isEmailTaken = async (email, excludeApplicationId) => {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return false;
  const [apps, fams, members, stuApps, students, users] = await Promise.all([
    rows("SELECT id, email, status FROM applications"),
    rows("SELECT email FROM families"),
    rows("SELECT email FROM family_members"),
    rows("SELECT id, email, status FROM student_applications"),
    rows("SELECT email FROM students"),
    rows("SELECT email FROM users"),
  ]);
  const candidates = [
    ...apps.filter((a) => a.status !== "REJECTED" && a.id !== excludeApplicationId).map((a) => a.email),
    ...fams.map((f) => f.email),
    ...members.map((m) => m.email),
    ...stuApps.filter((a) => a.status !== "REJECTED" && a.id !== excludeApplicationId).map((a) => a.email),
    ...students.map((s) => s.email),
    ...users.map((u) => u.email),
  ];
  return candidates.some((value) => String(value || "").trim().toLowerCase() === target);
};
// Verifies a Google reCAPTCHA v3 token server-side. The client only proves
// something to its own browser by calling grecaptcha.execute() — it proves
// nothing to us unless we independently ask Google, using our secret key,
// whether that token is genuine and what score it got. Skipping this step
// (trusting a client-sent "I passed" flag) would make the whole feature a
// no-op a script can bypass by simply not calling execute(). v3 has no
// pass/fail UI of its own — Google returns a 0.0–1.0 bot-likelihood score
// alongside `success`, so a real (but low-scoring, i.e. bot-like) token is
// still rejected here.
const RECAPTCHA_SCORE_THRESHOLD = 0.5;
const verifyRecaptcha = async (token) => {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true; // not configured — don't block registrations over a missing env var
  if (!token || typeof token !== "string") return false;
  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const result = await response.json();
    return Boolean(result.success) && (result.score === undefined || result.score >= RECAPTCHA_SCORE_THRESHOLD);
  } catch (error) {
    console.error("[recaptcha] verification request failed:", error.message);
    return false;
  }
};
const valueForSql = (value) => {
  if (value && typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
  return toMySqlDateTime(value);
};
const toColumn = (field) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const parseJsonIfNeeded = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return value;
    }
  }
  return value;
};
const toRecord = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key === "created_at" ? "created_date" : key === "updated_at" ? "updated_date" : key, parseJsonIfNeeded(value)]));
const allowedFields = (record) => Object.keys(record).filter((field) => !["id", "createdAt", "updatedAt", "created_date", "updated_date"].includes(field));
// Legitimate form input (names, addresses, course titles, feedback text...)
// never needs angle brackets. Rejecting them outright at the point of entry
// — rather than trying to sanitize/escape — stops HTML/script injection from
// ever reaching the database, the admin panel, or outbound emails, without
// silently mangling anyone's real data.
const MARKUP_PATTERN = /[<>]/;
const findMarkupField = (record) =>
  Object.entries(record).find(([, value]) => typeof value === "string" && MARKUP_PATTERN.test(value))?.[0] || null;
const buildWhere = (filter = {}, values = []) => {
  const entries = Object.entries(filter);
  if (!entries.length) return "";
  return ` WHERE ${entries.map(([field, value]) => { values.push(valueForSql(value)); return `${quoteIdentifier(toColumn(field))} = ?`; }).join(" AND ")}`;
};
const getBearerUser = async (request) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return (await rows("SELECT * FROM users WHERE session_token = ? AND session_expires_at > NOW() LIMIT 1", [token]))[0] || null;
};
const requireUser = async (request, response) => {
  const user = await getBearerUser(request);
  if (!user) { response.status(401).json({ error: "Authentication required." }); return null; }
  return user;
};
const requireAdmin = async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return null;
  if (user.role !== "admin") { response.status(403).json({ error: "Admin access required." }); return null; }
  return user;
};
const getOwnFamilyId = async (user) => {
  if (!user?.email) return null;
  const fam = (await rows("SELECT family_id FROM families WHERE LOWER(email) = LOWER(?) AND status = 'ACTIVE' LIMIT 1", [user.email]))[0];
  if (fam) return fam.family_id;
  const mem = (await rows("SELECT family_id FROM family_members WHERE LOWER(email) = LOWER(?) LIMIT 1", [user.email]))[0];
  return mem ? mem.family_id : null;
};
// Every entity accessible through the generic /api/entities router carries
// real PII (address, mobile, email, financials) with the sole exception of
// this public-content set, so GET defaults to admin-only unless listed here
// or explicitly carved out below.
const PUBLIC_READ_ENTITIES = new Set(["Event", "Announcement", "Rule", "Principle"]);
const AUTH_READ_ENTITIES = new Set(["Notification"]);
// Notification is public-create too: the unauthenticated registration flow
// creates a "your application was submitted" notification before login exists.
const PUBLIC_CREATE_ENTITIES = new Set(["Application", "StudentApplication", "Transaction", "Notification"]);
const AUTH_CREATE_ENTITIES = new Set(["Feedback", "EventRegistration", "TransferRequest"]);
const OWNERSHIP_ENTITIES = new Set(["Family", "FamilyMember"]);
// A logged-in family member may only write the exact fields the member-facing
// UI (MyFamily) ever sends for their own record — everything else on these
// tables (status approvals, family_id, membership_id, registration_date,
// application_id, linked_student_id, etc.) stays admin-only, even though the
// ownership check above would otherwise let them PATCH/POST their own row.
// Without this, a member could call the API directly to edit fields the UI
// never exposes, e.g. re-approving their own family or rewriting its identity.
const NON_ADMIN_WRITABLE_FIELDS = {
  Family: new Set(["member_count"]),
  FamilyMember: new Set(["name", "relationship", "gender", "dob", "mobile", "email", "education", "occupation", "address", "status"]),
  Notification: new Set(["read"]),
  EventRegistration: new Set(["registration_id", "event_id", "event_title", "family_id", "member_ids", "member_names", "count", "fee_per_member", "total_fee", "payment_status", "transaction_id", "status", "registered_by_id", "registered_date", "registrant_name"]),
  Feedback: new Set(["member_name", "email", "feedback_type", "subject", "message", "attachment_url", "status", "submitted_date", "questions", "rating"]),
  TransferRequest: new Set(["request_type", "status", "requester_name", "requester_email", "requester_mobile", "source_student_id", "source_membership_id", "source_family_id", "target_family_id", "target_family_name", "reason", "requester_id", "requested_date"]),
};
const restrictNonAdminFields = (entity, actingUser, body, { allowFamilyId } = {}) => {
  const allowed = NON_ADMIN_WRITABLE_FIELDS[entity];
  if (!allowed || actingUser?.role === "admin") return body;
  return Object.fromEntries(Object.entries(body).filter(([field]) => allowed.has(field) || (allowFamilyId && field === "family_id")));
};
// Sequential display IDs (e.g. NPSI-FAM-000123) are assigned here, server-side,
// on every create — never trusted from the client. This removes the need for
// members/registration forms to read whole tables just to compute the next
// number, and closes the collision risk of two clients computing the same ID.
const ID_FIELD_CONFIG = {
  Family: { field: "family_id", prefix: () => "NPSI-FAM-" },
  FamilyMember: { field: "membership_id", prefix: () => "NPSI-MEM-" },
  Student: { field: "student_id", prefix: () => "NPSI-STU-" },
  Application: { field: "application_id", prefix: () => `NPSI-APP-${new Date().getFullYear()}-` },
  StudentApplication: { field: "application_id", prefix: () => `NPSI-STU-APP-${new Date().getFullYear()}-` },
  TransferRequest: { field: "request_id", prefix: () => "TRF-" },
  Feedback: { field: "feedback_id", prefix: () => "FB-" },
};
const nextSequentialId = async (table, column, prefix) => {
  const row = (await rows(
    `SELECT MAX(CAST(SUBSTRING(${quoteIdentifier(column)}, ?) AS UNSIGNED)) AS maxNum FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  ))[0];
  return `${prefix}${String((row?.maxNum || 0) + 1).padStart(6, "0")}`;
};

app.get("/api/health", async (_request, response) => {
  try { await sequelize.authenticate(); response.json({ ok: true, database: "mysql" }); }
  catch (error) { response.status(503).json({ ok: false, error: error.message }); }
});

app.post("/api/auth/register", authLimiter, async (request, response, next) => {
  try {
    const { email, password, full_name, phone, recaptchaToken } = request.body || {};
    if (!(await verifyRecaptcha(recaptchaToken))) return response.status(400).json({ error: "reCAPTCHA verification failed. Please try again." });
    if (!email || !password || password.length < 6) return response.status(400).json({ error: "Email and password are required; password must be at least 6 characters." });
    if (!phone || !/^[6-9]\d{9}$/.test(phone.trim())) return response.status(400).json({ error: "A valid 10-digit mobile number is required." });
    const existingPhone = (await rows("SELECT id FROM users WHERE phone = ?", [phone.trim()]))[0];
    if (existingPhone) return response.status(409).json({ error: "This mobile number is already registered." });
    const id = crypto.randomUUID(); await query("INSERT INTO users (id, email, full_name, phone, password_hash, is_verified) VALUES (?, LOWER(?), ?, ?, ?, FALSE)", [id, email.trim(), full_name?.trim() || null, phone.trim(), hashPassword(password)]);
    const user = (await rows("SELECT * FROM users WHERE id = ?", [id]))[0];
    issueOtp(user).catch((error) => console.error("[mailer] otp email failed:", error.message));
    response.status(201).json({ user: publicUser(user), requiresOtp: true });
  } catch (error) { if (error.name === "SequelizeUniqueConstraintError") return response.status(409).json({ error: "An account with this email already exists." }); next(error); }
});

app.post("/api/auth/verify-otp", otpLimiter, async (request, response, next) => {
  try {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const code = String(request.body?.otpCode || "").trim();
    if (!email || !/^\d{6}$/.test(code)) return response.status(400).json({ error: "A valid 6-digit verification code is required." });
    const existing = (await rows("SELECT * FROM users WHERE email = ?", [email]))[0];
    if (!existing) return response.status(404).json({ error: "Account not found." });
    const notExpired = existing.otp_expires_at && new Date(existing.otp_expires_at) > new Date();
    const matches = existing.otp_hash && safeEqual(hashOtp(code), existing.otp_hash);
    if (!notExpired || !matches) return response.status(400).json({ error: "Invalid or expired verification code." });
    const isFirstVerification = !existing.is_verified;
    const token = createToken();
    await query("UPDATE users SET is_verified = TRUE, session_token = ?, session_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), otp_hash = NULL, otp_expires_at = NULL, updated_at = NOW() WHERE id = ?", [token, existing.id]);
    const user = (await rows("SELECT * FROM users WHERE id = ?", [existing.id]))[0];
    response.json({ user: publicUser(user), access_token: token });
    if (isFirstVerification) sendRegistrationEmails(user).catch((error) => console.error("[mailer] registration email failed:", error.message));
  } catch (error) { next(error); }
});

app.post("/api/auth/resend-otp", otpLimiter, async (request, response, next) => {
  try {
    const email = String(request.body?.email || "").trim().toLowerCase();
    if (!email) return response.status(400).json({ error: "Email is required." });
    const user = (await rows("SELECT * FROM users WHERE email = ? LIMIT 1", [email]))[0];
    if (user && !user.is_verified) await issueOtp(user).catch((error) => console.error("[mailer] otp email failed:", error.message));
    // Same response regardless of whether the account exists or is already
    // verified — this endpoint must never be usable to probe which emails
    // are registered.
    response.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/auth/login", authLimiter, async (request, response, next) => {
  try {
    const rawIdentifier = request.body?.email || request.body?.phone || request.body?.username || "";
    const identifier = String(rawIdentifier).trim();
    const phone = normalizeMobile(identifier);
    const user = (await rows("SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR phone = ? LIMIT 1", [identifier, phone || identifier]))[0];
    if (!user || !verifyPassword(request.body?.password || "", user.password_hash)) return response.status(401).json({ error: "Invalid email/phone or password." });
    if (!user.is_verified) return response.status(403).json({ error: "Please verify your account before logging in." });
    const token = createToken(); await query("UPDATE users SET session_token = ?, session_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), updated_at = NOW() WHERE id = ?", [token, user.id]);
    response.json({ user: publicUser(user), access_token: token });
  } catch (error) { next(error); }
});

app.post("/api/auth/reset-request", authLimiter, async (request, response, next) => {
  try {
    const email = request.body?.email?.trim().toLowerCase();
    if (!email) return response.status(400).json({ error: "Email is required." });
    const user = (await rows("SELECT id FROM users WHERE email = ?", [email]))[0];
    if (user) {
      const token = createToken();
      await query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE), updated_at = NOW() WHERE email = ?", [crypto.createHash("sha256").update(token).digest("hex"), email]);
      const resetUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
      // Best-effort send: a mailer/SMTP failure must never bubble up to the
      // client here — this endpoint takes an arbitrary, unauthenticated
      // email address, and letting the error handler reflect internal SMTP
      // error text back in the response would be an information leak.
      await sendMail({
        to: email,
        subject: "Reset your password",
        html: `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">Click here to reset your password</a></p><p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>`,
        text: `Reset your password: ${resetUrl} (expires in 30 minutes)`,
      }).catch((error) => console.error("[mailer] reset email failed:", error.message));
    }
    // Always the same response whether or not the account exists, and the
    // reset token never appears in the API response — it must only ever
    // reach the account holder via their email inbox.
    response.json({ ok: true });
  } catch (error) { next(error); }
});
app.post("/api/auth/reset-password", authLimiter, async (request, response, next) => {
  try {
    const { resetToken, newPassword } = request.body || {};
    if (!resetToken || !newPassword || newPassword.length < 6) return response.status(400).json({ error: "A valid reset token and password of at least 6 characters are required." });
    const [, result] = await query("UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL, is_verified = TRUE, updated_at = NOW() WHERE reset_token_hash = ? AND reset_token_expires_at > NOW()", [hashPassword(newPassword), crypto.createHash("sha256").update(resetToken).digest("hex")]);
    if (!result?.affectedRows) return response.status(400).json({ error: "This reset link is invalid or expired." }); response.json({ ok: true });
  } catch (error) { next(error); }
});
app.post("/api/auth/invite", async (request, response, next) => {
  try {
    // This creates accounts (including admin ones) and can overwrite an
    // existing account's password, returning the new password directly in
    // the response — it must never be reachable without an authenticated
    // admin caller.
    if (!(await requireAdmin(request, response))) return;
    const email = request.body?.email?.trim().toLowerCase();
    const { role, full_name, phone } = request.body || {};
    if (!email) return response.status(400).json({ error: "Email is required." });
    const loginPhone = normalizeMobile(phone || email);
    // Random, not derived from the phone number — a phone-based password
    // (e.g. "NPS@1234!" from the last 4 digits) is guessable by anyone who
    // knows the invitee's number, letting them log in before the invite
    // email is ever read.
    const defaultPassword = `NPS@${crypto.randomBytes(6).toString("base64url")}!`;
    let user = (await rows("SELECT * FROM users WHERE email = ? LIMIT 1", [email]))[0];
    if (!user) {
      const id = crypto.randomUUID();
      await query("INSERT INTO users (id, email, full_name, phone, password_hash, role, status, is_verified) VALUES (?, ?, ?, ?, ?, ?, 'invited', TRUE)", [id, email, full_name || null, phone || null, hashPassword(defaultPassword), role === "admin" ? "admin" : "user"]);
      user = (await rows("SELECT * FROM users WHERE id = ?", [id]))[0];
    } else {
      await query("UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), password_hash = ?, is_verified = TRUE, status = 'invited', updated_at = NOW() WHERE id = ?", [full_name || user.full_name, phone || user.phone, hashPassword(defaultPassword), user.id]);
      user = (await rows("SELECT * FROM users WHERE id = ?", [user.id]))[0];
    }
    const token = createToken();
    await query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY), updated_at = NOW() WHERE id = ?", [crypto.createHash("sha256").update(token).digest("hex"), user.id]);
    const setPasswordUrl = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const loginUrl = `${frontendUrl}/login`;
    const invite = memberInviteEmail({
      name: user.full_name || email.split("@")[0],
      setPasswordUrl,
      loginUrl,
      username: user.email || user.phone || loginPhone,
      password: defaultPassword,
    });
    await sendMail({ to: email, subject: invite.subject, html: invite.html, text: invite.text }).catch((error) => console.error("[mailer] invite email failed:", error.message));
    response.status(201).json({ ok: true, username: user.email || user.phone || loginPhone, password: defaultPassword });
  } catch (error) { next(error); }
});
app.post("/api/auth/change-password", authLimiter, async (request, response, next) => {
  try {
    const user = await getBearerUser(request);
    if (!user) return response.status(401).json({ error: "Authentication required." });
    const { currentPassword, newPassword } = request.body || {};
    if (!newPassword || newPassword.length < 6) return response.status(400).json({ error: "New password must be at least 6 characters." });
    if (!verifyPassword(currentPassword || "", user.password_hash)) return response.status(401).json({ error: "Current password is incorrect." });
    await query("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [hashPassword(newPassword), user.id]);
    response.json({ ok: true });
  } catch (error) { next(error); }
});
app.get("/api/auth/me", async (request, response, next) =>{ try { const user = await getBearerUser(request); if (!user) return response.status(401).json({ error: "Authentication required." }); response.json(publicUser(user)); } catch (error) { next(error); } });
app.post("/api/auth/logout", async (request, response, next) => { try { const token = request.headers.authorization?.replace(/^Bearer\s+/i, ""); await query("UPDATE users SET session_token = NULL, session_expires_at = NULL WHERE session_token = ?", [token]); response.status(204).end(); } catch (error) { next(error); } });

// ---- Narrow, purpose-built endpoints that replace the old pattern of ----
// ---- fetching a whole sensitive table just to filter it client-side. ----
app.get("/api/me/family", async (request, response, next) => {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    let family = null;
    if (user.email) {
      family = (await rows("SELECT * FROM families WHERE LOWER(email) = LOWER(?) AND status = 'ACTIVE' LIMIT 1", [user.email]))[0] || null;
      if (!family) {
        const member = (await rows("SELECT family_id FROM family_members WHERE LOWER(email) = LOWER(?) LIMIT 1", [user.email]))[0];
        if (member) family = (await rows("SELECT * FROM families WHERE family_id = ? LIMIT 1", [member.family_id]))[0] || null;
      }
    }
    const members = family ? await rows("SELECT * FROM family_members WHERE family_id = ? ORDER BY created_at ASC", [family.family_id]) : [];
    const student = user.email ? (await rows("SELECT * FROM students WHERE LOWER(email) = LOWER(?) AND status != 'TRANSFERRED' LIMIT 1", [user.email]))[0] || null : null;
    response.json({ family: family ? toRecord(family) : null, members: members.map(toRecord), student: student ? toRecord(student) : null });
  } catch (error) { next(error); }
});
app.get("/api/me/feedback", async (request, response, next) => {
  try {
    const user = await requireUser(request, response);
    if (!user) return;
    const list = user.email ? await rows("SELECT * FROM feedback WHERE LOWER(email) = LOWER(?) ORDER BY created_at DESC LIMIT 100", [user.email]) : [];
    response.json(list.map(toRecord));
  } catch (error) { next(error); }
});
app.get("/api/verify/:familyId", publicLookupLimiter, async (request, response, next) => {
  try {
    const family = (await rows("SELECT family_id, family_name, head_name, status, city, registration_date FROM families WHERE family_id = ? LIMIT 1", [request.params.familyId]))[0];
    if (!family) return response.status(404).json({ error: "No family found for this ID." });
    const members = await rows("SELECT name, relationship, gender, status FROM family_members WHERE family_id = ? ORDER BY created_at ASC", [request.params.familyId]);
    response.json({ family, members });
  } catch (error) { next(error); }
});
app.get("/api/track/application", publicLookupLimiter, async (request, response, next) => {
  try {
    const applicationId = String(request.query.applicationId || "").trim();
    const mobile = String(request.query.mobile || "").trim();
    if (!applicationId || !mobile) return response.status(400).json({ error: "Application ID and mobile number are required." });
    const application = (await rows("SELECT * FROM applications WHERE application_id = ? AND mobile = ? LIMIT 1", [applicationId, mobile]))[0];
    if (!application) return response.status(404).json({ error: "No application found for this ID and mobile number." });
    response.json(toRecord(application));
  } catch (error) { next(error); }
});
app.get("/api/check-mobile", async (request, response, next) => {
  try {
    const target = normalizeMobile(request.query.mobile);
    if (!target) return response.json({ taken: false });
    const [apps, fams, members, stuApps, students] = await Promise.all([
      rows("SELECT mobile, status FROM applications"),
      rows("SELECT contact_number FROM families"),
      rows("SELECT mobile FROM family_members"),
      rows("SELECT mobile, status FROM student_applications"),
      rows("SELECT mobile FROM students"),
    ]);
    const candidates = [
      ...apps.filter((a) => a.status !== "REJECTED").map((a) => a.mobile),
      ...fams.map((f) => f.contact_number),
      ...members.map((m) => m.mobile),
      ...stuApps.filter((a) => a.status !== "REJECTED").map((a) => a.mobile),
      ...students.map((s) => s.mobile),
    ];
    response.json({ taken: candidates.some((value) => normalizeMobile(value) === target) });
  } catch (error) { next(error); }
});
app.get("/api/check-email", async (request, response, next) => {
  try { response.json({ taken: await isEmailTaken(String(request.query.email || "")) }); }
  catch (error) { next(error); }
});
app.get("/api/stats", async (_request, response, next) => {
  try {
    const [[families], [members]] = await Promise.all([
      rows("SELECT COUNT(*) AS count FROM families WHERE status = 'ACTIVE'"),
      rows("SELECT COUNT(*) AS count FROM family_members WHERE status = 'ACTIVE'"),
    ]);
    response.json({ families: families.count, members: members.count });
  } catch (error) { next(error); }
});

app.post("/api/upload", uploadLimiter, (request, response) => {
  upload.single("file")(request, response, (error) => {
    if (error) return response.status(400).json({ error: error.message || "Upload failed." });
    if (!request.file) return response.status(400).json({ error: "No file uploaded." });
    const fileUrl = `${request.protocol}://${request.get("host")}/uploads/${request.file.filename}`;
    response.status(201).json({ file_url: fileUrl });
  });
});

app.get("/api/entities/:entity", async (request, response, next) => {
  try {
    const entity = request.params.entity;
    const table = getTable(entity);
    let requestingUser = null;
    if (!PUBLIC_READ_ENTITIES.has(entity)) {
      requestingUser = AUTH_READ_ENTITIES.has(entity) ? await requireUser(request, response) : await requireAdmin(request, response);
      if (!requestingUser) return;
    }
    const filter = request.query.filter ? JSON.parse(request.query.filter) : {}; const values = []; let where = buildWhere(filter, values);
    if (entity === "Notification" && requestingUser.role !== "admin") {
      // Notification is the one AUTH_READ (any logged-in user) entity, but
      // each row targets one family via recipient_family_id — without this,
      // any member could read every other family's notifications (approval
      // remarks, transfer details, etc.) via this same generic endpoint.
      const ownFamilyId = await getOwnFamilyId(requestingUser);
      const clause = `(${quoteIdentifier("recipient_family_id")} = ? OR ${quoteIdentifier("recipient_family_id")} IS NULL)`;
      values.push(ownFamilyId || "__none__");
      where = where ? `${where} AND ${clause}` : ` WHERE ${clause}`;
    }
    const limit = Math.min(Math.max(Number(request.query.limit || 100), 1), 500); const order = request.query.order || "-createdAt"; const descending = order.startsWith("-"); const orderField = toColumn(descending ? order.slice(1) : order); values.push(limit);
    response.json((await rows(`SELECT * FROM ${quoteIdentifier(table)}${where} ORDER BY ${quoteIdentifier(orderField)} ${descending ? "DESC" : "ASC"} LIMIT ?`, values)).map(toRecord));
  } catch (error) { next(error); }
});
app.post("/api/entities/:entity", async (request, response, next) => {
  try {
    const entity = request.params.entity;
    const table = getTable(entity);
    let actingUser = null;
    if (PUBLIC_CREATE_ENTITIES.has(entity)) {
      // no auth required — public registration / payment-intent flows
    } else if (OWNERSHIP_ENTITIES.has(entity)) {
      actingUser = await requireUser(request, response);
      if (!actingUser) return;
      if (actingUser.role !== "admin") {
        if (entity === "Family") return response.status(403).json({ error: "Admin access required." });
        const ownFamilyId = await getOwnFamilyId(actingUser);
        if (!ownFamilyId || request.body?.family_id !== ownFamilyId) return response.status(403).json({ error: "You can only add members to your own family." });
      }
    } else if (AUTH_CREATE_ENTITIES.has(entity)) {
      actingUser = await requireUser(request, response);
      if (!actingUser) return;
    } else {
      actingUser = await requireAdmin(request, response);
      if (!actingUser) return;
    }
    // PUBLIC_CREATE_ENTITIES (Application, StudentApplication, Transaction,
    // Notification) never have a logged-in actingUser here by design — the
    // non-admin field whitelist below exists to stop an authenticated
    // non-admin from writing fields the UI never exposes on their OWN
    // ownership/auth-gated records, which doesn't apply to these anonymous,
    // separately-validated entities. Applying it here anyway (actingUser
    // null, "admin" check false) silently stripped every field down to
    // nothing for Notification and broke all notification creation.
    const sanitizedBody = PUBLIC_CREATE_ENTITIES.has(entity)
      ? sanitizeDateValues(request.body || {})
      : restrictNonAdminFields(entity, actingUser, sanitizeDateValues(request.body || {}), { allowFamilyId: true });
    const record = { id: crypto.randomUUID(), ...sanitizedBody };
    if (actingUser?.role !== "admin") {
      const badField = findMarkupField(record);
      if (badField) return response.status(400).json({ error: `The "${badField}" field cannot contain < or > characters.` });
    }
    if (entity === "EventRegistration" && actingUser?.role !== "admin") {
      // Fee/payment fields are otherwise fully client-supplied (there's no
      // payment gateway here — admins reconcile payments manually), so
      // without this a member could register for a paid event while
      // claiming total_fee: 0 and payment_status: "SUCCESS" for themselves,
      // or register another family's members against their own family_id.
      const ownFamilyId = await getOwnFamilyId(actingUser);
      if (!ownFamilyId || record.family_id !== ownFamilyId) return response.status(403).json({ error: "You can only register your own family for events." });
      const memberIds = Array.isArray(record.member_ids) ? record.member_ids : [];
      if (memberIds.length) {
        const ownMembers = await rows("SELECT id FROM family_members WHERE family_id = ?", [ownFamilyId]);
        const ownMemberIdSet = new Set(ownMembers.map((m) => m.id));
        if (!memberIds.every((id) => ownMemberIdSet.has(id))) return response.status(403).json({ error: "You can only register members of your own family." });
      }
      const event = (await rows("SELECT fee FROM events WHERE id = ?", [record.event_id]))[0];
      if (!event) return response.status(404).json({ error: "Event not found." });
      const feePerMember = toMoneyNumber(event.fee);
      const totalFee = feePerMember * memberIds.length;
      record.fee_per_member = feePerMember;
      record.total_fee = totalFee;
      record.payment_status = totalFee === 0 ? "SUCCESS" : "PENDING";
      record.registered_by_id = actingUser.id;
    }
    if (entity === "TransferRequest" && actingUser?.role !== "admin") {
      // Without this, a member could hand-craft a request that's already
      // "APPROVED" with its own resulting_membership_id/new_family_id, or
      // file a transfer against a family/member/student that isn't theirs.
      const ownFamilyId = await getOwnFamilyId(actingUser);
      if (record.source_family_id && record.source_family_id !== ownFamilyId) return response.status(403).json({ error: "You can only request a transfer for your own family." });
      if (record.source_membership_id) {
        const member = (await rows("SELECT family_id FROM family_members WHERE membership_id = ?", [record.source_membership_id]))[0];
        if (!member || member.family_id !== ownFamilyId) return response.status(403).json({ error: "You can only request a transfer for a member of your own family." });
      }
      if (record.source_student_id) {
        const student = (await rows("SELECT email, linked_family_id FROM students WHERE student_id = ?", [record.source_student_id]))[0];
        const ownEmail = String(actingUser.email || "").toLowerCase();
        const matchesOwnRecord = student && ((student.email && String(student.email).toLowerCase() === ownEmail) || (ownFamilyId && student.linked_family_id === ownFamilyId));
        if (!matchesOwnRecord) return response.status(403).json({ error: "You can only request a transfer for your own student record." });
      }
      record.requester_id = actingUser.id;
      record.status = "PENDING";
    }
    if (entity === "Application" || entity === "StudentApplication") {
      // Public, unauthenticated forms — the most bot/spam-abused entry
      // points — so these are the ones that carry a reCAPTCHA token. The
      // token is never a real column, so it's stripped from `record` here
      // regardless of outcome (pass or fail) before the INSERT is built.
      const token = record.recaptchaToken;
      delete record.recaptchaToken;
      if (!(await verifyRecaptcha(token))) return response.status(400).json({ error: "reCAPTCHA verification failed. Please try again." });
    }
    const idConfig = ID_FIELD_CONFIG[entity];
    if (idConfig) record[idConfig.field] = await nextSequentialId(table, toColumn(idConfig.field), idConfig.prefix());
    const fields = allowedFields(record); const columns = ["id", ...fields.map(toColumn)]; const values = [record.id, ...fields.map((field) => valueForSql(record[field]))];
    if (entity === "Application") {
      if (!record.mobile || normalizeMobile(record.mobile).length !== 10) return response.status(400).json({ error: "A valid 10-digit mobile number is required." });
      if (!record.family_name || !String(record.family_name).trim()) return response.status(400).json({ error: "Family name is required." });
      if (!record.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) return response.status(400).json({ error: "A valid email address is required." });
      if (!record.address || !String(record.address).trim()) return response.status(400).json({ error: "Address is required." });
      if (!record.city || !String(record.city).trim()) return response.status(400).json({ error: "City is required." });
      if (!record.district || !String(record.district).trim()) return response.status(400).json({ error: "District is required." });
      if (await isMobileTaken(record.mobile)) return response.status(409).json({ error: "This mobile number is already registered on the portal." });
      if (await isEmailTaken(record.email)) return response.status(409).json({ error: "This email is already registered on the portal." });
    }
    if (entity === "StudentApplication") {
      if (!record.student_name || !String(record.student_name).trim()) return response.status(400).json({ error: "Student name is required." });
      if (!record.mobile || normalizeMobile(record.mobile).length !== 10) return response.status(400).json({ error: "A valid 10-digit mobile number is required." });
      if (record.guardian_mobile && normalizeMobile(record.guardian_mobile).length !== 10) return response.status(400).json({ error: "Guardian mobile number must be a valid 10-digit number." });
      if (!record.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) return response.status(400).json({ error: "A valid email address is required." });
      if (!record.gender || !String(record.gender).trim()) return response.status(400).json({ error: "Gender is required." });
      if (!record.father_name || !String(record.father_name).trim()) return response.status(400).json({ error: "Father's name is required." });
      if (!record.academic_year || !String(record.academic_year).trim()) return response.status(400).json({ error: "Academic year is required." });
      if (await isMobileTaken(record.mobile)) return response.status(409).json({ error: "This mobile number is already registered on the portal." });
      if (await isEmailTaken(record.email)) return response.status(409).json({ error: "This email is already registered on the portal." });
    }
    await query(`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, values);
    const created = toRecord((await rows(`SELECT * FROM ${quoteIdentifier(table)} WHERE id = ?`, [record.id]))[0]);
    response.status(201).json(created);
    if (entity === "Application") sendApplicationEmails(created).catch((error) => console.error("[mailer] application email failed:", error.message));
  } catch (error) { next(error); }
});
app.post("/api/entities/:entity/bulk", async (request, response, next) => {
  try {
    const entity = request.params.entity;
    const table = getTable(entity);
    if (!(await requireAdmin(request, response))) return;
    const records = Array.isArray(request.body?.records) ? request.body.records : [];
    if (!records.length) return response.json([]);

    const idConfig = ID_FIELD_CONFIG[entity];
    let nextNum = null; let prefix = null;
    if (idConfig) { prefix = idConfig.prefix(); nextNum = parseInt((await nextSequentialId(table, toColumn(idConfig.field), prefix)).slice(prefix.length), 10); }

    const created = [];
    for (const item of records) {
      const sanitized = sanitizeDateValues(item || {});
      const record = { id: crypto.randomUUID(), ...sanitized };
      if (idConfig) { record[idConfig.field] = `${prefix}${String(nextNum).padStart(6, "0")}`; nextNum += 1; }
      const fields = allowedFields(record);
      const columns = ["id", ...fields.map(toColumn)];
      const values = [record.id, ...fields.map((field) => valueForSql(record[field]))];
      await query(`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, values);
      const inserted = toRecord((await rows(`SELECT * FROM ${quoteIdentifier(table)} WHERE id = ?`, [record.id]))[0]);
      created.push(inserted);
    }

    response.status(201).json(created);
  } catch (error) { next(error); }
});
app.patch("/api/entities/:entity/:id", async (request, response, next) => {
  try {
    const entity = request.params.entity;
    const table = getTable(entity);
    let actingUser = null;
    if (OWNERSHIP_ENTITIES.has(entity)) {
      actingUser = await requireUser(request, response);
      if (!actingUser) return;
      if (actingUser.role !== "admin") {
        const ownFamilyId = await getOwnFamilyId(actingUser);
        if (!ownFamilyId) return response.status(403).json({ error: "No family found for your account." });
        if (entity === "Family") {
          const fam = (await rows("SELECT family_id FROM families WHERE id = ?", [request.params.id]))[0];
          if (!fam || fam.family_id !== ownFamilyId) return response.status(403).json({ error: "You can only update your own family." });
        } else {
          const member = (await rows("SELECT family_id FROM family_members WHERE id = ?", [request.params.id]))[0];
          if (!member || member.family_id !== ownFamilyId) return response.status(403).json({ error: "You can only update members of your own family." });
        }
      }
    } else if (AUTH_READ_ENTITIES.has(entity)) {
      actingUser = await requireUser(request, response);
      if (!actingUser) return;
      if (entity === "Notification" && actingUser.role !== "admin") {
        const notif = (await rows("SELECT recipient_family_id FROM notifications WHERE id = ?", [request.params.id]))[0];
        const ownFamilyId = await getOwnFamilyId(actingUser);
        if (!notif || (notif.recipient_family_id && notif.recipient_family_id !== ownFamilyId)) {
          return response.status(403).json({ error: "You can only update your own notifications." });
        }
      }
    } else {
      actingUser = await requireAdmin(request, response);
      if (!actingUser) return;
    }
    const sanitizedBody = restrictNonAdminFields(entity, actingUser, sanitizeDateValues(request.body || {}));
    if (actingUser.role !== "admin") {
      const badField = findMarkupField(sanitizedBody);
      if (badField) return response.status(400).json({ error: `The "${badField}" field cannot contain < or > characters.` });
    }
    const fields = allowedFields(sanitizedBody); const values = fields.map((field) => valueForSql(sanitizedBody[field]));
    if (fields.length) { values.push(request.params.id); await query(`UPDATE ${quoteIdentifier(table)} SET ${fields.map((field) => `${quoteIdentifier(toColumn(field))} = ?`).join(", ")}, updated_at = NOW() WHERE id = ?`, values); }
    const record = (await rows(`SELECT * FROM ${quoteIdentifier(table)} WHERE id = ?`, [request.params.id]))[0]; if (!record) return response.status(404).json({ error: "Record not found" }); response.json(toRecord(record));
  } catch (error) { next(error); }
});
app.delete("/api/entities/:entity/:id", async (request, response, next) => {
  try {
    const entity = request.params.entity;
    const table = getTable(entity);
    if (entity === "FamilyMember") {
      const actingUser = await requireUser(request, response);
      if (!actingUser) return;
      if (actingUser.role !== "admin") {
        const ownFamilyId = await getOwnFamilyId(actingUser);
        const member = (await rows("SELECT family_id FROM family_members WHERE id = ?", [request.params.id]))[0];
        if (!ownFamilyId || !member || member.family_id !== ownFamilyId) return response.status(403).json({ error: "You can only remove members of your own family." });
      }
    } else {
      if (!(await requireAdmin(request, response))) return;
    }
    await query(`DELETE FROM ${quoteIdentifier(table)} WHERE id = ?`, [request.params.id]);
    response.status(204).end();
  } catch (error) { next(error); }
});
app.use((error, _request, response, _next) => response.status(error.status || 500).json({ error: error.message }));
app.listen(port, () => console.log(`MySQL API listening on http://localhost:${port}`));