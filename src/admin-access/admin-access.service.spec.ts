import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import { fakeAccountDb } from "../testing/fake-repo.js";
import { admin, as, rejectsWith } from "../testing/fakes.js";
import { userRow } from "../testing/rows.js";
import { AdminAccessService } from "./admin-access.controller.js";

const member = userRow({ id: "u-m", email: "member@example.com", fullName: "Ram Patidar", role: "user", status: "active" });
const build = () => {
  const saved = new Map<string, Record<string, unknown>>();
  const accounts = fakeAccountDb({
    users: [
      member,
      userRow({ id: "u-admin", email: "admin@npsindore.org", role: "admin" }),
      userRow({ id: "u-nofamily", email: "nobody@example.com", role: "user" }),
    ],
    families: [{ ownerUserId: "u-m", familyId: "NPSI-FAM-000024", status: "ACTIVE", village: "Rampura" }],
  });
  const db = {
    ...accounts,
    user: {
      ...accounts.user,
      findUnique: mock.fn(
        async (args: { where: { id: string } }) =>
          [member, userRow({ id: "u-admin", role: "admin" }), userRow({ id: "u-nofamily", role: "user" })].find((row) => row.id === args.where.id) ?? null,
      ),
      findMany: mock.fn(async () => [member]),
    },
    adminAccess: {
      upsert: mock.fn(async (args: { where: { userId: string }; create: Record<string, unknown> }) => {
        saved.set(args.where.userId, { ...args.create, updatedAt: new Date() });
        return {};
      }),
      findMany: mock.fn(async () => [...saved.values()]),
      deleteMany: mock.fn(async () => ({ count: 1 })),
    },
  };
  return { service: new AdminAccessService(as<PrismaService>(db)), saved };
};

describe("AdminAccessService (Admin → Assign roles)", () => {
  test("gives a registered family member chosen admin work for chosen villages; the list shows who and what", async () => {
    const { service, saved } = build();
    const row = await service.save(
      "u-m",
      { areas: ["REGISTRATIONS", "FAMILIES", "FAMILIES"], allVillages: false, villages: [" Rampura ", "rampura", "Ghegaon"], note: "Coordinator" },
      admin(),
    );
    assert.deepEqual([row.name, row.familyId, row.village, row.active], ["Ram Patidar", "NPSI-FAM-000024", "Rampura", true]);
    assert.deepEqual(row.areas, ["REGISTRATIONS", "FAMILIES"]);
    assert.deepEqual(row.villages, ["Rampura", "Ghegaon"], "trimmed, no duplicates");
    assert.equal(saved.get("u-m")?.grantedById, "u-admin");
  });
  test("refuses a super admin, someone who isn't a registered family member, no access chosen, or no villages", async () => {
    const { service } = build();
    const access = { areas: ["REGISTRATIONS"], allVillages: true, villages: [] };
    await rejectsWith(service.save("u-admin", access, admin()), 400, "This account is already a super admin.");
    await rejectsWith(service.save("u-nofamily", access, admin()), 400, "Admin access can only be given to an active, registered family member.");
    await rejectsWith(service.save("missing", access, admin()), 404, "Account not found.");
    await rejectsWith(service.save("u-m", { ...access, areas: [] }, admin()), 400, "Choose at least one admin access.");
    await rejectsWith(service.save("u-m", { ...access, allVillages: false }, admin()), 400, "Choose the villages, or all villages.");
  });
});
