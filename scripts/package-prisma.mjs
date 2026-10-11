// Keep migration assets beside the compiled application, including every future migration.
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "dist");
if (!existsSync(path.join(target, "main.js"))) throw new Error("Build the application before packaging Prisma assets.");
mkdirSync(target, { recursive: true });
cpSync(path.join(root, "prisma"), path.join(target, "prisma"), { recursive: true });
writeFileSync(path.join(target, "prisma.config.mjs"), `import { defineConfig, env } from "@prisma/config";
export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: { path: "./prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
`);
console.log("Packaged Prisma schema, configuration and migrations in dist.");
