import { execFileSync } from "node:child_process";
import path from "node:path";
import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { QueryTypes, Sequelize } from "sequelize";
import { AppConfigService } from "../config/app-config.service.js";
import { PROJECT_ROOT } from "../config/project-root.js";

export type DbRow = Record<string, unknown>;
export type Replacements = unknown[];

// Raw-SQL access exactly as the legacy app did it (sequelize.query with
// positional replacements), so query semantics and driver error messages are
// unchanged. Repositories build their SQL on top of this service.
@Injectable()
export class DatabaseService implements OnApplicationBootstrap, OnApplicationShutdown {
  readonly sequelize: Sequelize;

  constructor(config: AppConfigService) {
    const db = config.database;
    this.sequelize = new Sequelize(db.name, db.user, db.password, { host: db.host, port: db.port, dialect: "mysql", logging: false, timezone: "+00:00" });
  }

  // Like the legacy server: connect, then run pending migrations, without
  // blocking startup; a failed migration is logged and the app keeps running.
  onApplicationBootstrap(): void {
    if (process.env.SKIP_DB_BOOTSTRAP === "true") return;
    void this.testConnection().then((connected) => {
      if (connected) this.runPendingMigrations();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.sequelize.close();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.sequelize.authenticate();
      console.log("✅ Database connected successfully");
      return true;
    } catch (error) {
      console.error("❌ Database connection failed:", error instanceof Error ? error.message : error);
      return false;
    }
  }

  runPendingMigrations(): void {
    try {
      execFileSync(
        process.execPath,
        [
          path.join(PROJECT_ROOT, "node_modules/sequelize-cli/lib/sequelize"),
          "db:migrate",
          "--env",
          "development",
          "--config",
          path.join(PROJECT_ROOT, "config/database.cjs"),
          "--migrations-path",
          path.join(PROJECT_ROOT, "db/migrations-sequelize"),
        ],
        { cwd: PROJECT_ROOT, stdio: "pipe" },
      );
      console.log("✅ Database migrations up to date");
    } catch (error) {
      const output = (error as { stdout?: Buffer }).stdout?.toString();
      console.error("⚠️  Migration run failed (server will still start):", output || (error instanceof Error ? error.message : error));
    }
  }

  authenticate(): Promise<void> {
    return this.sequelize.authenticate();
  }

  // INSERT/UPDATE/DELETE. Resolves to sequelize's [results, metadata] pair.
  execute(sql: string, replacements: Replacements = []): Promise<[unknown, unknown]> {
    return this.sequelize.query(sql, { replacements }) as Promise<[unknown, unknown]>;
  }

  rows<T extends DbRow = DbRow>(sql: string, replacements: Replacements = []): Promise<T[]> {
    return this.sequelize.query(sql, { replacements, type: QueryTypes.SELECT }) as Promise<T[]>;
  }

  async first<T extends DbRow = DbRow>(sql: string, replacements: Replacements = []): Promise<T | undefined> {
    return (await this.rows<T>(sql, replacements))[0];
  }
}
