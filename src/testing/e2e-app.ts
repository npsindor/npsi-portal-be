// e2e harness: boots the real Nest app in-process (same configureApp as
// production) against a throwaway MySQL database, migrated and seeded fresh.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import mysql from "mysql2/promise";
import request from "supertest";
import { hashOtp, hashPassword, sha256 } from "../common/utils/crypto.js";

export const TOKENS = { admin: "a".repeat(64), member: "m".repeat(64), noFamily: "n".repeat(64) } as const;
export const PASSWORD = "Secret@123";
export const OTP = "654321";
export const FAMILY = "NPSI-FAM-000001";

const DB_NAME = "npsi_e2e_test";
let app: NestExpressApplication;
let ipCounter = 0;

const connect = async () => {
  await import("../config/load-env.js");
  return mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
  });
};

export const startApp = async (): Promise<void> => {
  const admin = await connect();
  await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await admin.query(`CREATE DATABASE \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();
  Object.assign(process.env, {
    MYSQL_DATABASE: DB_NAME,
    SKIP_DB_BOOTSTRAP: "true",
    UPLOADS_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "npsi-e2e-uploads-")),
    APP_ENV: "e2e",
    LOG_REQUESTS: "false",
    TRUST_PROXY: "1",
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    RECAPTCHA_SECRET_KEY: "",
  });
  const [{ AppModule }, { configureApp }, { PrismaService }] = await Promise.all([
    import("../app.module.js"),
    import("../configure-app.js"),
    import("../database/prisma.service.js"),
  ]);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  await prisma.runPendingMigrations();
  await seed({ execute: (sql, params = []) => prisma.$executeRawUnsafe(sql, ...params) });
};

export const stopApp = async (): Promise<void> => {
  const uploads = process.env.UPLOADS_DIR;
  await app?.close();
  const admin = await connect();
  await admin.query(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  await admin.end();
  if (uploads) fs.rmSync(uploads, { recursive: true, force: true });
};

type Db = { execute: (sql: string, replacements?: unknown[]) => Promise<unknown> };
const seed = async (db: Db): Promise<void> => {
  const pw = hashPassword(PASSWORD);
  await db.execute(
    `INSERT INTO users (id, email, full_name, phone, role, password_hash, is_verified, session_token, session_expires_at) VALUES
     ('u-admin', 'admin@e2e.local', 'Admin', '9100000001', 'admin', ?, 1, ?, DATE_ADD(NOW(), INTERVAL 1 DAY)),
     ('u-member', 'member@e2e.local', 'Member', '9100000002', 'user', ?, 1, ?, DATE_ADD(NOW(), INTERVAL 1 DAY)),
     ('u-nofamily', 'nofamily@e2e.local', 'No Family', '9100000003', 'user', ?, 1, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))`,
    // Sessions are stored as SHA-256 of the token.
    [pw, sha256(TOKENS.admin), pw, sha256(TOKENS.member), pw, sha256(TOKENS.noFamily)],
  );
  await db.execute(
    "INSERT INTO users (id, email, phone, password_hash, is_verified, otp_hash, otp_expires_at) VALUES ('u-otp', 'otp@e2e.local', '9100000004', ?, 0, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
    [pw, hashOtp(OTP)],
  );
  await db.execute(
    "INSERT INTO families (id, family_id, family_name, head_name, status, city, contact_number, email, created_at) VALUES ('f-1', ?, 'Patel', 'Head', 'ACTIVE', 'Indore', '9200000001', 'member@e2e.local', '2026-01-01')",
    [FAMILY],
  );
  await db.execute(
    "INSERT INTO family_members (id, family_id, membership_id, name, relationship, gender, mobile, email, status, created_at) VALUES ('fm-1', ?, 'NPSI-MEM-000001', 'Member One', 'Self', 'Male', '9300000001', 'member@e2e.local', 'ACTIVE', '2026-01-01')",
    [FAMILY],
  );
  await db.execute("INSERT INTO events (id, title, date, venue, fee, status) VALUES ('ev-1', 'Event', '2026-12-01', 'Hall', 50, 'PUBLISHED')");
  await db.execute(
    "INSERT INTO applications (id, application_id, family_head_name, mobile, email, family_name, address, city, district) VALUES ('app-1', 'NPSI-APP-2026-000001', 'Applicant', '9400000001', 'applicant@e2e.local', 'Fam', 'Addr', 'Indore', 'Indore')",
  );
};

// Each request gets its own client IP so the per-IP rate limits never interfere.
export const api = (method: "get" | "post" | "put" | "patch" | "delete", url: string, token?: string) => {
  ipCounter += 1;
  const req = request(app.getHttpServer())
    [method](url)
    .set("X-Forwarded-For", `10.1.${(ipCounter >> 8) & 255}.${ipCounter & 255}`);
  return token ? req.set("Authorization", `Bearer ${token}`) : req;
};
