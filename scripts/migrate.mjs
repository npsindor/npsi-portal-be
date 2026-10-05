// npm run db:migrate — create the database if missing, then apply Prisma
// migrations. A database built by the legacy sequelize-cli migrations is
// baselined first (0_init marked applied, never run), exactly like the app
// does on startup. Reads .env.local then .env (process environment wins).
import { execFileSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ path: [path.resolve(".env.local"), path.resolve(".env")], quiet: true });

const LEGACY_MIGRATIONS = 8;
const database = process.env.MYSQL_DATABASE || "patidar_samaj";
const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "cdn123",
});
await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database.replaceAll("`", "``")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
const [tables] = await connection.query(
  "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('_prisma_migrations', 'SequelizeMeta')",
  [database],
);
const names = new Set(tables.map((t) => t.name));
let baseline = false;
if (!names.has("_prisma_migrations") && names.has("SequelizeMeta")) {
  const [[{ n }]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${database.replaceAll("`", "``")}\`.SequelizeMeta`);
  if (n < LEGACY_MIGRATIONS) throw new Error(`Legacy database has ${n}/${LEGACY_MIGRATIONS} sequelize migrations; apply them before switching to Prisma Migrate.`);
  baseline = true;
}
await connection.end();

const prisma = (...args) => execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), ...args], { stdio: "inherit" });
if (baseline) prisma("migrate", "resolve", "--applied", "0_init");
prisma("migrate", "deploy");
