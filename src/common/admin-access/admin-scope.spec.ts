import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { Db } from "../../database/prisma.service.js";
import { admin, user } from "../../testing/fakes.js";
import { type AdminScope, adminScopeOf, SUPER_ADMIN_SCOPE, villageAllowed, villageWhere } from "./admin-scope.js";

const dbWith = (row: unknown) => ({ adminAccess: { findUnique: mock.fn(async () => row) } }) as unknown as Db;
const staff: AdminScope = { superAdmin: false, areas: ["REGISTRATIONS"], allVillages: false, villages: ["Rampura", "Ghegaon"] };

describe("admin scope (role-based admin access)", () => {
  test("the super admin has everything; a member only what their active access row grants; nobody else anything", async () => {
    assert.deepEqual(await adminScopeOf(dbWith(null), admin()), SUPER_ADMIN_SCOPE);
    assert.equal(await adminScopeOf(dbWith(null), user()), null);
    assert.equal(await adminScopeOf(dbWith(null), null), null);
    const row = { active: true, areas: ["REGISTRATIONS", "NOT_AN_AREA"], allVillages: false, villages: ["Rampura"] };
    assert.deepEqual(await adminScopeOf(dbWith(row), user()), { superAdmin: false, areas: ["REGISTRATIONS"], allVillages: false, villages: ["Rampura"] });
    assert.equal(await adminScopeOf(dbWith({ ...row, active: false }), user()), null, "switched off");
    assert.equal(await adminScopeOf(dbWith({ ...row, areas: [] }), user()), null, "no areas");
    assert.equal(await adminScopeOf(dbWith(row), user({ status: "disabled" })), null, "a disabled login has no access");
  });
  test("villages match case- and spacing-insensitively, on any of the record's village fields", () => {
    assert.equal(villageAllowed(staff, "  rampura "), true);
    assert.equal(villageAllowed(staff, null, "GHEGAON"), true);
    assert.equal(villageAllowed(staff, "Khedi", null), false);
    assert.equal(villageAllowed(staff, null, null), false, "no village: only for all-villages access");
    assert.equal(villageAllowed({ ...staff, allVillages: true }, null), true);
  });
  test("list filter: none for all villages; otherwise the villages in their usual spellings, on each field", () => {
    assert.equal(villageWhere(SUPER_ADMIN_SCOPE, ["village"]), undefined);
    const where = villageWhere(staff, ["village", "nativePlace"]) as { OR: Record<string, { in: string[] }>[] };
    assert.equal(where.OR.length, 2);
    assert.ok(where.OR[0].village.in.includes("Rampura") && where.OR[0].village.in.includes("rampura"));
    assert.deepEqual(villageWhere({ ...staff, villages: [] }, ["village"]), { id: "__none__" });
  });
});
