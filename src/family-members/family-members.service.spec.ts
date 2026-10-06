import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { FAM, fakeMembership, fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { familyMemberRow } from "../testing/rows.js";
import type { FamilyMembersRepository } from "./family-members.repository.js";
import { FamilyMembersService } from "./family-members.service.js";

const member = () => user({ id: "u-m" });
const build = () => {
  const repo = fakeModelRepo(familyMemberRow, [familyMemberRow({ id: "m-own", familyId: FAM }), familyMemberRow({ id: "m-other", familyId: "OTHER" })]);
  repo.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-MEM-000051"]);
  return { service: new FamilyMembersService(as<FamilyMembersRepository>(repo), as<MembershipRepository>(fakeMembership())), repo };
};

describe("FamilyMembersService", () => {
  test("members add to their own family only, with the form's fields", async () => {
    const { service } = build();
    const created = await service.create({ familyId: FAM, name: "Kid", relationship: "Son", dob: "2015-03-04", photoUrl: "/x.png" }, member());
    assert.deepEqual([created.membershipId, created.familyId, created.dob, created.photoUrl], ["NPSI-MEM-000052", FAM, "2015-03-04", null]);
    await rejectsWith(service.create({ familyId: "OTHER", name: "X", relationship: "Son" }, member()), 403, "You can only add members to your own family.");
    await rejectsWith(service.create({ familyId: FAM, name: "<b>", relationship: "Son" }, member()), 400, 'The "name" field cannot contain < or > characters.');
  });
  test("members edit and remove only their own family's members", async () => {
    const { service } = build();
    const updated = await service.update("m-own", { name: "N", membershipId: "HACK" } as never, member());
    assert.equal(updated.name, "N");
    await rejectsWith(service.update("m-other", { name: "N" }, member()), 403, "You can only update members of your own family.");
    await rejectsWith(service.update("m-own", { name: "N" }, user()), 403, "No family found for your account.");
    await rejectsWith(service.remove("m-other", member()), 403, "You can only remove members of your own family.");
    await service.remove("m-own", member());
  });
  test("admins: batch with consecutive ids (200 with [] for nothing), any update, 404", async () => {
    const { service, repo } = build();
    assert.deepEqual(await service.createBatch([]), { status: 200, records: [] });
    const batch = await service.createBatch([
      { familyId: "F", name: "A", relationship: "Self" },
      { familyId: "F", name: "B", relationship: "Son" },
    ]);
    assert.deepEqual([batch.status, ...batch.records.map((m) => m.membershipId)], [201, "NPSI-MEM-000052", "NPSI-MEM-000053"]);
    assert.equal(repo.createMany.mock.callCount(), 1);
    assert.equal((await service.update("m-other", { status: "ACTIVE" }, admin())).status, "ACTIVE");
    await rejectsWith(service.update("missing", {}, admin()), 404, "Record not found");
    await service.remove("m-other", admin());
    assert.equal((await service.list({ familyId: FAM })).length, 2);
  });
});
