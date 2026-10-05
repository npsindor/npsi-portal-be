import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { HttpException } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service.js";
import { as, fakeConfig } from "../testing/fakes.js";
import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  test("ok with the environment name when the database answers", async () => {
    const service = new HealthService(as<PrismaService>({ ping: async () => undefined }), fakeConfig({ appEnv: "test" }));
    assert.deepEqual(await service.check(), { ok: true, database: "mysql", env: "test" });
  });
  test("503 with { ok: false, error } when it doesn't", async () => {
    const service = new HealthService(
      as<PrismaService>({
        ping: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
      fakeConfig(),
    );
    await assert.rejects(service.check(), (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 503);
      assert.deepEqual(error.getResponse(), { ok: false, error: "connect ECONNREFUSED" });
      return true;
    });
  });
});
