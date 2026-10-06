import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { FAM, fakeMembership, fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { familyRow } from "../testing/rows.js";
import type { FamiliesRepository } from "./families.repository.js";
import { FamiliesService } from "./families.service.js";

const member = () => user({ id: "u-m" });
const build = () => {
  const repo = fakeModelRepo(familyRow, [
    familyRow({ id: "f-own", familyId: FAM, memberCount: 2, status: "ACTIVE" }),
    familyRow({ id: "f-other", familyId: "OTHER" }),
  ]);
  repo.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-FAM-000023"]);
  return { service: new FamiliesService(as<FamiliesRepository>(repo), as<MembershipRepository>(fakeMembership())), repo };
};

describe("FamiliesService", () => {
  test("list filters by display id and status", async () => {
    const { service, repo } = build();
    await service.list({ familyId: FAM, status: "ACTIVE", order: "familyName" });
    assert.deepEqual(repo.list.mock.calls[0].arguments, [{ familyId: FAM, status: "ACTIVE" }, { familyName: "asc" }, 100]);
  });
  test("admins create with the next display id", async () => {
    const created = await build().service.create({ familyName: "New", registrationDate: "2026-02-01T10:00:00.000Z" });
    assert.deepEqual([created.familyId, created.registrationDate], ["NPSI-FAM-000024", new Date("2026-02-01T10:00:00.000Z")]);
  });
  test("members may only change their own family's member count", async () => {
    const { service } = build();
    const updated = await service.update("f-own", { memberCount: 3, status: "REJECTED" }, member());
    assert.deepEqual([updated.memberCount, updated.status], [3, "ACTIVE"]);
    await rejectsWith(service.update("f-other", { memberCount: 1 }, member()), 403, "You can only update your own family.");
    await rejectsWith(service.update("f-own", { memberCount: 1 }, user()), 403, "No family found for your account.");
  });
  test("admins update anything; 404; remove", async () => {
    const { service } = build();
    assert.equal((await service.update("f-other", { status: "ACTIVE" }, admin())).status, "ACTIVE");
    await rejectsWith(service.update("missing", {}, admin()), 404, "Record not found");
    await service.remove("f-other");
  });
});
