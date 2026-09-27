import "./env.js";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Sequelize } from "sequelize";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE || "patidar_samaj",
  process.env.MYSQL_USER || "root",
  process.env.MYSQL_PASSWORD || "cdn123",
  {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    dialect: "mysql",
    logging: false,
    timezone: "+00:00",
  },
);

export const testDBConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message || error);
    return false;
  }
};

// Runs any not-yet-applied schema migrations on every boot. This means a
// plain zip-upload-and-restart deploy is enough — no manual "did you remember
// to run the migration on live" step, which was the actual cause of the
// transfer_requests and student father_name columns going missing in
// production after earlier deploys.
const runPendingMigrations = () => {
  try {
    execFileSync(
      process.execPath,
      [
        path.join(backendRoot, "node_modules/sequelize-cli/lib/sequelize"),
        "db:migrate",
        "--env", "development",
        "--config", path.join(backendRoot, "config/database.cjs"),
        "--migrations-path", path.join(backendRoot, "db/migrations-sequelize"),
      ],
      { cwd: backendRoot, stdio: "pipe" },
    );
    console.log("✅ Database migrations up to date");
  } catch (error) {
    console.error("⚠️  Migration run failed (server will still start):", error.stdout?.toString() || error.message);
  }
};

testDBConnection().then((connected) => { if (connected) runPendingMigrations(); });

export const query = (sql, replacements = [], options = {}) => sequelize.query(sql, {
  replacements,
  ...options,
});