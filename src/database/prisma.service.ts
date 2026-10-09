import { execFileSync } from "node:child_process";
import path from "node:path";
import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { AppConfigService } from "../config/app-config.service.js";
import { PROJECT_ROOT } from "../config/project-root.js";
import { type Prisma, PrismaClient } from "../generated/prisma/client.js";

// A Prisma client or the client of a running transaction (`prisma.$transaction(async (tx) => …)`):
// repository methods take one so a service can run several of them as one unit.
export type Db = Prisma.TransactionClient;

const PRISMA_CLI = path.join(PROJECT_ROOT, "node_modules/prisma/build/index.js");
const BASELINE_MIGRATION = "0_init";
// Every sequelize-cli migration the 0_init baseline already contains.
const LEGACY_MIGRATIONS = [
  "001-initial-schema.cjs",
  "002-seed-principles.cjs",
  "003-timestamp-defaults.cjs",
  "004-users-phone.cjs",
  "005-transfer-request-requester-fields.cjs",
  "006-student-father-name.cjs",
  "007-users-otp.cjs",
  "008-event-news-hindi.cjs",
];

// The Prisma client for the whole app (MySQL through the MariaDB driver
// adapter, configured from the existing MYSQL_* variables). On startup it
// connects and applies pending Prisma migrations without blocking the server,
// like the legacy app did with sequelize-cli; a failure is logged, not fatal.
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(config: AppConfigService) {
    const db = config.database;
    super({
      adapter: new PrismaMariaDb({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        database: db.name,
        timezone: "+00:00",
        // Avoid filling ten connections on every watch-mode restart.
        connectionLimit: 3,
        minimumIdle: 1,
      }),
    });
  }

  onApplicationBootstrap(): void {
    if (process.env.SKIP_DB_BOOTSTRAP === "true") return;
    void this.testConnection().then(async (connected) => {
      if (connected && process.env.SKIP_DB_MIGRATIONS !== "true") await this.runPendingMigrations();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.ping();
      console.log("✅ Database connected successfully");
      return true;
    } catch (error) {
      console.error("❌ Database connection failed:", error instanceof Error ? error.message : error);
      return false;
    }
  }

  async runPendingMigrations(): Promise<void> {
    try {
      await this.baselineLegacyDatabaseIfNeeded();
      this.prismaCli(["migrate", "deploy"]);
      console.log("✅ Database migrations up to date");
    } catch (error) {
      const e = error as { stdout?: Buffer; stderr?: Buffer };
      const output = e.stderr?.toString() || e.stdout?.toString();
      console.error("⚠️  Migration run failed (server will still start):", output || (error instanceof Error ? error.message : error));
    }
  }

  // Databases built by the legacy sequelize-cli migrations already contain every
  // table of the 0_init baseline: the first time, mark it applied without running
  // it. Fresh databases (no tables) run all migrations normally.
  private async baselineLegacyDatabaseIfNeeded(): Promise<void> {
    const tables = await this.$queryRaw<{ name: string }[]>`
      SELECT TABLE_NAME AS name FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('_prisma_migrations', 'SequelizeMeta')`;
    const names = new Set(tables.map((t) => t.name));
    if (names.has("_prisma_migrations") || !names.has("SequelizeMeta")) return;
    // The baseline equals the schema after every legacy migration; never mark it
    // applied on a database that stopped short of that.
    const applied = new Set((await this.$queryRaw<{ name: string }[]>`SELECT name FROM SequelizeMeta`).map((row) => row.name));
    const missing = LEGACY_MIGRATIONS.filter((name) => !applied.has(name));
    if (missing.length)
      throw new Error(`Legacy database is missing sequelize migrations ${missing.join(", ")}; apply them before switching to Prisma Migrate.`);
    this.prismaCli(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
    console.log(`✅ Existing database baselined at Prisma migration ${BASELINE_MIGRATION}`);
  }

  private prismaCli(args: string[]): string {
    return execFileSync(process.execPath, [PRISMA_CLI, ...args], { cwd: PROJECT_ROOT, stdio: "pipe", env: process.env }).toString();
  }
}
