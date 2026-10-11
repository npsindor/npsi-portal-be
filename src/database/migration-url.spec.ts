import assert from "node:assert/strict";
import { test } from "node:test";
import { migrationDatabaseUrl } from "./migration-url.js";
import { PrismaService } from "./prisma.service.js";

const db = { host: "production-db.example.com", port: 3307, user: "user@company", password: "p%40:@/?# x", name: "community prod" };

test("migration URL uses the actual remote host and preserves special characters", () => {
  const url = new URL(migrationDatabaseUrl(db));
  assert.equal(url.hostname, db.host);
  assert.equal(url.port, "3307");
  assert.equal(decodeURIComponent(url.username), db.user);
  assert.equal(decodeURIComponent(url.password), db.password);
  assert.equal(decodeURIComponent(url.pathname.slice(1)), db.name);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
});

test("local and IPv6 database hosts work without silently falling back", () => {
  assert.equal(new URL(migrationDatabaseUrl({ ...db, host: "localhost" })).hostname, "localhost");
  assert.equal(new URL(migrationDatabaseUrl({ ...db, host: "::1" })).hostname, "[::1]");
  for (const host of ["", "host with spaces", "host/other", "user@host"]) assert.throws(() => migrationDatabaseUrl({ ...db, host }));
  for (const port of [0, 65536, NaN]) assert.throws(() => migrationDatabaseUrl({ ...db, port }));
});

test("startup waits for migration completion and rejects connection or migration failures", async () => {
  const previous = { bootstrap: process.env.SKIP_DB_BOOTSTRAP, migrations: process.env.SKIP_DB_MIGRATIONS };
  delete process.env.SKIP_DB_BOOTSTRAP;
  delete process.env.SKIP_DB_MIGRATIONS;
  try {
    let complete!: () => void;
    let finished = false;
    const service = {
      testConnection: async () => true,
      runPendingMigrations: () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    };
    const start = PrismaService.prototype.onApplicationBootstrap.call(service as unknown as PrismaService).then(() => {
      finished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finished, false);
    complete();
    await start;
    assert.equal(finished, true);
    await assert.rejects(
      PrismaService.prototype.onApplicationBootstrap.call({ testConnection: async () => false } as unknown as PrismaService),
      /connection failed/,
    );
    await assert.rejects(
      PrismaService.prototype.onApplicationBootstrap.call({
        testConnection: async () => true,
        runPendingMigrations: async () => {
          throw new Error("migration failed");
        },
      } as unknown as PrismaService),
      /migration failed/,
    );
  } finally {
    if (previous.bootstrap === undefined) delete process.env.SKIP_DB_BOOTSTRAP;
    else process.env.SKIP_DB_BOOTSTRAP = previous.bootstrap;
    if (previous.migrations === undefined) delete process.env.SKIP_DB_MIGRATIONS;
    else process.env.SKIP_DB_MIGRATIONS = previous.migrations;
  }
});
