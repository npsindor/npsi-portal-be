import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("the release includes the schema and every migration byte-for-byte", () => {
  const compare = (relative) => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) compare(file);
      else assert.deepEqual(readFileSync(path.join(root, "dist", file)), readFileSync(path.join(root, file)), file);
    }
  };
  compare("prisma");
});

test("Prisma loads the release config without repository schema or a matching working directory", () => {
  const release = mkdtempSync(path.join(os.tmpdir(), "npsi-prisma-release-"));
  try {
    cpSync(path.join(root, "dist/prisma"), path.join(release, "prisma"), { recursive: true });
    cpSync(path.join(root, "dist/prisma.config.mjs"), path.join(release, "prisma.config.mjs"));
    symlinkSync(path.join(root, "node_modules"), path.join(release, "node_modules"), "dir");
    // validate loads schema/config without connecting to any database.
    const output = execFileSync(
      process.execPath,
      [path.join(root, "node_modules/prisma/build/index.js"), "validate", "--config", path.join(release, "prisma.config.mjs")],
      {
        cwd: os.tmpdir(),
        env: { ...process.env, DATABASE_URL: "mysql://unused:unused@127.0.0.1:1/unused" },
        encoding: "utf8",
        stdio: "pipe",
      },
    );
    assert.match(output, /valid/i);
  } finally {
    rmSync(release, { recursive: true, force: true });
  }
});
