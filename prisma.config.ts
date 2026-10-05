// Prisma CLI configuration (migrate, generate, db pull). The connection URL is
// built from the same MYSQL_* variables the app uses, loaded with the same
// rule (.env.local, then .env; the process environment wins).
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: [path.resolve(".env.local"), path.resolve(".env")], quiet: true });

const env = process.env;
const url =
  env.DATABASE_URL ??
  `mysql://${encodeURIComponent(env.MYSQL_USER || "root")}:${encodeURIComponent(env.MYSQL_PASSWORD || "cdn123")}@${env.MYSQL_HOST || "localhost"}:${env.MYSQL_PORT || 3306}/${env.MYSQL_DATABASE || "patidar_samaj"}`;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url },
});
