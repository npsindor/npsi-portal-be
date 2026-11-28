import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import type { PrismaService } from "../database/prisma.service.js";
import { admin, as } from "../testing/fakes.js";
import { SITE_KEYS, SiteVisibilityService, SiteVisibilityUpdateDto } from "./site-visibility.controller.js";

describe("SiteVisibilityService", () => {
  test("lists only the switched-off keys it knows; an admin's change is saved per key", async () => {
    const rows = new Map<string, boolean>([
      ["page:/travel-assistance", false],
      ["section:home.gallery", false],
      ["page:/old-removed-page", false],
      ["page:/about", true],
    ]);
    const db = {
      siteVisibility: {
        findMany: mock.fn(async () => [...rows].filter(([, visible]) => !visible).map(([key]) => ({ key }))),
        upsert: mock.fn(async (args: { where: { key: string }; create: { visible: boolean; updatedById: string } }) => {
          rows.set(args.where.key, args.create.visible);
          return {};
        }),
      },
      $transaction: mock.fn(async (work: Promise<unknown>[]) => Promise.all(work)),
    };
    const service = new SiteVisibilityService(as<PrismaService>(db));
    assert.deepEqual((await service.hidden()).hidden, ["page:/travel-assistance", "section:home.gallery"]);
    const after = await service.update(
      {
        items: [
          { key: "page:/travel-assistance", visible: true },
          { key: "section:home.updates", visible: false },
        ],
      },
      admin(),
    );
    assert.deepEqual(after.hidden, ["section:home.gallery", "section:home.updates"]);
    assert.equal((db.siteVisibility.upsert.mock.calls[0].arguments[0] as { create: { updatedById: string } }).create.updatedById, "u-admin");
  });
  test("only known pages and sections are accepted; the homepage itself is not one of them", async () => {
    const errors = async (body: unknown) => (await validate(plainToInstance(SiteVisibilityUpdateDto, body))).length;
    assert.equal(await errors({ items: [{ key: "page:/about", visible: false }] }), 0);
    assert.ok((await errors({ items: [{ key: "page:/admin", visible: false }] })) > 0);
    assert.ok((await errors({ items: [{ key: "page:/about", visible: "no" }] })) > 0);
    assert.ok(!SITE_KEYS.includes("page:/"));
  });
});
