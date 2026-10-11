import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { AppConfigService } from "../config/app-config.service.js";
import { PROJECT_ROOT } from "../config/project-root.js";
import { type Prisma, PrismaClient } from "../generated/prisma/client.js";

import { migrationDatabaseUrl } from "./migration-url.js";

// A Prisma client or the client of a running transaction (`prisma.$transaction(async (tx) => …)`):
// repository methods take one so a service can run several of them as one unit.
export type Db = Prisma.TransactionClient;

const PRISMA_CLI = path.join(path.dirname(createRequire(import.meta.url).resolve("prisma/package.json")), "build/index.js");
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
// connects and finishes pending migrations before accepting requests. A failed
// migration stops startup instead of serving requests against an outdated schema.
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(private readonly config: AppConfigService) {
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

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.SKIP_DB_BOOTSTRAP === "true") return;
    if (!(await this.testConnection())) throw new Error("Database connection failed; server startup stopped.");
    if (process.env.SKIP_DB_MIGRATIONS !== "true") await this.runPendingMigrations();
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
      console.error("❌ Migration run failed; server startup stopped:", output || (error instanceof Error ? error.message : error));
      throw new Error("Database migrations failed. Check the migration log before restarting the server.");
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
    // Compiled releases carry their own schema and full migration history.
    // Source/test execution can use the repository config instead.
    const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const bundledConfig = path.join(appDirectory, "prisma.config.mjs");
    const configPath = existsSync(bundledConfig) ? bundledConfig : path.join(PROJECT_ROOT, "prisma.config.ts");
    const assets = path.join(existsSync(bundledConfig) ? appDirectory : PROJECT_ROOT, "prisma");
    if (!existsSync(configPath) || !existsSync(path.join(assets, "schema.prisma")) || !existsSync(path.join(assets, "migrations/migration_lock.toml"))) {
      throw new Error(
        "Prisma migration assets are missing. Build with npm run build and deploy the entire dist directory, including dist/prisma and dist/prisma.config.mjs.",
      );
    }
    const migrations = path.join(assets, "migrations");
    const folders = readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    if (!folders.length || folders.some((entry) => !existsSync(path.join(migrations, entry.name, "migration.sql")))) {
      throw new Error("Prisma migration history is incomplete. Deploy the entire dist/prisma/migrations directory.");
    }
    // The API uses MYSQL_*; a stale DATABASE_URL must never migrate another database.
    const url = migrationDatabaseUrl(this.config.database);
    return execFileSync(process.execPath, [PRISMA_CLI, ...args, "--config", configPath], {
      cwd: appDirectory,
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: url },
    }).toString();
  }
}
