// Black-box contract test harness: starts the API as a child process on a
// throwaway MySQL database, seeds known data, and exposes a Supertest client.
// The same suite runs against the legacy Express app and the NestJS app; only
// CONTRACT_SERVER_CMD (how to start it) and CONTRACT_API (which path table) change.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import request from "supertest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Only DB host/user/password come from the developer's env files; the database
// name is always the throwaway one below.
const localEnv = { ...dotenv.config({ path: path.join(root, ".env"), processEnv: {} }).parsed, ...dotenv.config({ path: path.join(root, ".env.local"), processEnv: {} }).parsed };
export const DB_NAME = process.env.CONTRACT_DB || "npsi_contract_test";
const dbConfig = {
  host: process.env.CONTRACT_MYSQL_HOST || localEnv.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.CONTRACT_MYSQL_PORT || localEnv.MYSQL_PORT || 3306),
  user: process.env.CONTRACT_MYSQL_USER || localEnv.MYSQL_USER || "root",
  password: process.env.CONTRACT_MYSQL_PASSWORD ?? localEnv.MYSQL_PASSWORD ?? "",
};
const PORT = Number(process.env.CONTRACT_PORT || 4790);
const SERVER_CMD = (process.env.CONTRACT_SERVER_CMD || "node server/index.js").split(" ");
const MIGRATION_COUNT = fs.readdirSync(path.join(root, "db/migrations-sequelize")).filter((f) => f.endsWith(".cjs")).length;
export const UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "npsi-contract-uploads-"));

export const TOKENS = { admin: "a".repeat(64), member: "m".repeat(64), other: "o".repeat(64), expired: "e".repeat(64), noFamily: "n".repeat(64) };
export const PASSWORDS = { admin: "Admin@123", member: "Member@123", unverified: "Unverified@123", login: "Login@123" };
export const OTP_CODE = "123456";
export const IDS = {
  adminUser: "u-admin", memberUser: "u-member", otherUser: "u-other", unverifiedUser: "u-unverified", otpUser: "u-otp", loginUser: "u-login", noFamilyUser: "u-nofamily",
  family1: "f-1", family2: "f-2", member1: "fm-1", member2: "fm-2",
  event: "ev-1", freeEvent: "ev-2", application: "app-1", notifOwn: "n-1", notifOther: "n-2", notifBroadcast: "n-3",
  announcement: "an-1", feedback: "fb-1", student: "st-1",
};
export const FAMILY1 = "NPSI-FAM-000001";
export const FAMILY2 = "NPSI-FAM-000002";

let server;
let db;
let ipCounter = 0;

const hashPassword = (password) => { const salt = crypto.randomBytes(16).toString("hex"); return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`; };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const waitFor = async (check, label, timeoutMs = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { if (await check()) return; } catch { /* not ready yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

export const query = (sql, params = []) => db.query(sql, params).then(([result]) => result);

const seed = async () => {
  const user = (id, email, password, extra = {}) => ({ id, email, full_name: email.split("@")[0], phone: null, role: "user", password_hash: hashPassword(password), is_verified: 1, status: "active", ...extra });
  const users = [
    user(IDS.adminUser, "admin@test.local", PASSWORDS.admin, { role: "admin", phone: "9100000001", session_token: TOKENS.admin }),
    user(IDS.memberUser, "member@test.local", PASSWORDS.member, { phone: "9100000002", session_token: TOKENS.member }),
    user(IDS.otherUser, "other@test.local", PASSWORDS.member, { phone: "9100000003", session_token: TOKENS.other }),
    user(IDS.unverifiedUser, "unverified@test.local", PASSWORDS.unverified, { is_verified: 0, phone: "9100000004" }),
    user(IDS.otpUser, "otp@test.local", PASSWORDS.unverified, { is_verified: 0, phone: "9100000005", otp_hash: sha256(OTP_CODE) }),
    user(IDS.loginUser, "login@test.local", PASSWORDS.login, { phone: "9100000006" }),
    user(IDS.noFamilyUser, "nofamily@test.local", PASSWORDS.member, { phone: "9100000007", session_token: TOKENS.noFamily }),
  ];
  for (const u of users) {
    await query(
      `INSERT INTO users (id, email, full_name, phone, role, password_hash, is_verified, status, session_token, session_expires_at, otp_hash, otp_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${u.session_token ? "DATE_ADD(NOW(), INTERVAL 1 DAY)" : "NULL"}, ?, ${u.otp_hash ? "DATE_ADD(NOW(), INTERVAL 10 MINUTE)" : "NULL"})`,
      [u.id, u.email, u.full_name, u.phone, u.role, u.password_hash, u.is_verified, u.status, u.session_token || null, u.otp_hash || null],
    );
  }
  await query("INSERT INTO users (id, email, password_hash, session_token, session_expires_at) VALUES ('u-expired', 'expired@test.local', ?, ?, DATE_SUB(NOW(), INTERVAL 1 DAY))", [hashPassword("x123456"), TOKENS.expired]);
  await query("INSERT INTO families (id, family_id, family_name, head_name, status, city, contact_number, email, registration_date, member_count, created_at) VALUES (?, ?, 'Patel', 'Member Head', 'ACTIVE', 'Indore', '9200000001', 'member@test.local', '2026-01-01 00:00:00', 1, '2026-01-01 00:00:00'), (?, ?, 'Other', 'Other Head', 'ACTIVE', 'Bhopal', '9200000002', 'other@test.local', '2026-01-02 00:00:00', 1, '2026-01-02 00:00:00')", [IDS.family1, FAMILY1, IDS.family2, FAMILY2]);
  await query("INSERT INTO family_members (id, family_id, membership_id, name, relationship, gender, mobile, email, status, created_at) VALUES (?, ?, 'NPSI-MEM-000001', 'Member One', 'Self', 'Male', '9300000001', 'member@test.local', 'ACTIVE', '2026-01-01 00:00:00'), (?, ?, 'NPSI-MEM-000002', 'Other One', 'Self', 'Female', '9300000002', 'other@test.local', 'ACTIVE', '2026-01-02 00:00:00')", [IDS.member1, FAMILY1, IDS.member2, FAMILY2]);
  await query("INSERT INTO events (id, title, date, venue, fee, status, created_at) VALUES (?, 'Paid Event', '2026-12-01', 'Hall', 100, 'PUBLISHED', '2026-01-03 00:00:00'), (?, 'Free Event', '2026-12-02', 'Hall', 0, 'PUBLISHED', '2026-01-04 00:00:00')", [IDS.event, IDS.freeEvent]);
  await query("INSERT INTO applications (id, application_id, status, family_head_name, mobile, email, family_name, address, city, district, members_data, created_at) VALUES (?, 'NPSI-APP-2026-000001', 'SUBMITTED', 'Applicant', '9400000001', 'applicant@test.local', 'Applicant Family', 'Street', 'Indore', 'Indore', '[{\"name\":\"A\"}]', '2026-01-05 00:00:00')", [IDS.application]);
  await query("INSERT INTO notifications (id, title, message, type, recipient_family_id, created_at) VALUES (?, 'Own', 'For family 1', 'info', ?, '2026-01-06 00:00:00'), (?, 'Other', 'For family 2', 'info', ?, '2026-01-07 00:00:00'), (?, 'All', 'Broadcast', 'info', NULL, '2026-01-08 00:00:00')", [IDS.notifOwn, FAMILY1, IDS.notifOther, FAMILY2, IDS.notifBroadcast]);
  await query("INSERT INTO announcements (id, title, body, status, created_at) VALUES (?, 'Hello', 'World', 'Active', '2026-01-09 00:00:00')", [IDS.announcement]);
  await query("INSERT INTO feedback (id, feedback_id, member_name, email, subject, message, created_at) VALUES (?, 'FB-000001', 'Member One', 'member@test.local', 'Hi', 'Message', '2026-01-10 00:00:00')", [IDS.feedback]);
  await query("INSERT INTO students (id, student_id, student_name, status, mobile, email, created_at) VALUES (?, 'NPSI-STU-000001', 'Student One', 'ACTIVE', '9500000001', 'member@test.local', '2026-01-11 00:00:00')", [IDS.student]);
};

export const setup = async () => {
  db = await mysql.createConnection({ ...dbConfig, multipleStatements: false });
  await db.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await db.query(`CREATE DATABASE \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await db.query(`USE \`${DB_NAME}\``);
  server = spawn(SERVER_CMD[0], SERVER_CMD.slice(1), {
    cwd: root,
    env: {
      ...process.env,
      MYSQL_HOST: dbConfig.host, MYSQL_PORT: String(dbConfig.port), MYSQL_USER: dbConfig.user, MYSQL_PASSWORD: dbConfig.password,
      MYSQL_DATABASE: DB_NAME, API_PORT: String(PORT), UPLOADS_DIR, APP_ENV: "contract", FRONTEND_URL: "http://localhost:5173",
      TRUST_PROXY: "1", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", SMTP_PORT: "", SMTP_FROM: "", RECAPTCHA_SECRET_KEY: "",
      ADMIN_NOTIFICATION_EMAILS: "admin-notify@test.local",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  try {
    await waitFor(async () => (await query("SELECT COUNT(*) AS n FROM SequelizeMeta"))[0].n >= MIGRATION_COUNT, "migrations");
    await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/api/health`).catch(() => fetch(`http://127.0.0.1:${PORT}/api/v1/health`))).ok, "server");
  } catch (error) {
    throw new Error(`${error.message}\n--- server output ---\n${output}`);
  }
  await seed();
};

export const teardown = async () => {
  server?.kill();
  if (db) { await db.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``); await db.end(); }
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
};

// Every request gets its own client IP (the app trusts one proxy hop), so the
// per-IP rate limiters never interfere with the suite.
export const nextIp = () => { ipCounter += 1; return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`; };
export const http = () => request(`http://127.0.0.1:${PORT}`);
export const call = (method, url, { token, ip } = {}) => {
  const req = http()[method.toLowerCase()](url).set("X-Forwarded-For", ip || nextIp());
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};
