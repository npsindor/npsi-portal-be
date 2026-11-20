import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { HttpException } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service.js";
import { as } from "../testing/fakes.js";
import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  test("only { ok: true } when the database answers: no database type or environment name", async () => {
    const service = new HealthService(as<PrismaService>({ ping: async () => undefined }));
    assert.deepEqual(await service.check(), { ok: true });
  });
  test("503 with a generic { ok: false, error } when it doesn't (the driver error is not sent)", async () => {
    const service = new HealthService(
      as<PrismaService>({
        ping: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      }),
    );
    await assert.rejects(service.check(), (error: unknown) => {
      assert.ok(error instanceof HttpException);
      assert.equal(error.getStatus(), 503);
      assert.deepEqual(error.getResponse(), { ok: false, error: "Service unavailable." });
      return true;
    });
  });
});
