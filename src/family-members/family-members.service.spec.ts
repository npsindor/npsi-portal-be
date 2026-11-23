import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { FAM, type FakeAccountRecords, fakeMembership, fakeModelRepo, fakePrisma, TX } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { familyMemberRow } from "../testing/rows.js";
import type { FamilyMembersRepository } from "./family-members.repository.js";
import { FamilyMembersService } from "./family-members.service.js";

const member = () => user({ id: "u-m" });
const build = (accounts?: FakeAccountRecords) => {
  const repo = fakeModelRepo(familyMemberRow, [
    familyMemberRow({ id: "m-own", familyId: FAM, status: "ACTIVE", email: "son@example.com", mobile: "9000000001" }),
    familyMemberRow({ id: "m-other", familyId: "OTHER" }),
  ]);
  repo.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-MEM-000051"]);
  return {
    service: new FamilyMembersService(as<PrismaService>(fakePrisma(accounts)), as<FamilyMembersRepository>(repo), as<MembershipRepository>(fakeMembership())),
    repo,
  };
};

describe("FamilyMembersService", () => {
  test("members add to their own family only, with the form's fields", async () => {
    const { service } = build();
    const created = await service.create({ familyId: FAM, name: "Kid", relationship: "Son", dob: "2015-03-04", photoUrl: "/x.png" }, member());
    assert.deepEqual([created.membershipId, created.familyId, created.dob, created.photoUrl], ["NPSI-MEM-000052", FAM, "2015-03-04", null]);
    await rejectsWith(service.create({ familyId: "OTHER", name: "X", relationship: "Son" }, member()), 403, "You can only add members to your own family.");
    await rejectsWith(service.create({ familyId: FAM, name: "<b>", relationship: "Son" }, member()), 400, 'The "name" field cannot contain < or > characters.');
  });
  test("a registered family's new member is ACTIVE at once (no admin approval); the client can't set the status", async () => {
    const { service, repo } = build();
    const created = await service.create({ familyId: FAM, name: "Kid", relationship: "Son", status: "INACTIVE" }, member());
    assert.equal(created.status, "ACTIVE");
    const adult = await service.create(
      { familyId: FAM, name: "Brother", relationship: "Brother", dob: "1995-01-02", mobile: "9000000077", email: "brother@example.com" },
      member(),
    );
    assert.equal(adult.status, "ACTIVE", "an adult with a mobile and an email that is nobody's login");
    repo.stored.push(familyMemberRow({ id: "m-pending", familyId: FAM, status: "PENDING" }));
    assert.equal(
      (await service.update("m-pending", { status: "ACTIVE", name: "Still waiting" }, member())).status,
      "PENDING",
      "an older pending member stays with the admin",
    );
    assert.equal(
      (await service.update("m-own", { status: "INACTIVE", name: "Same person" }, member())).status,
      "ACTIVE",
      "a head can't change status either way",
    );
  });
  test("a new mobile or email keeps the member ACTIVE, unless the email is already another person's login", async () => {
    const { service } = build({ users: [{ id: "u-someone", email: "someone@example.com", role: "user" }] });
    assert.equal((await service.update("m-own", { email: "SON@example.com", mobile: "+91 90000 00001" }, member())).status, "ACTIVE", "same contact");
    assert.equal((await service.update("m-own", { mobile: "9000000099", email: "new@example.com" }, member())).status, "ACTIVE");
    assert.equal((await service.update("m-own", { email: "someone@example.com" }, member())).status, "PENDING", "someone else's login waits for an admin");
  });
  test("adding a member with the email of someone else's login waits for an admin; the head's own email doesn't", async () => {
    const { service } = build({
      users: [
        { id: "u-someone", email: "someone@example.com", role: "user" },
        { id: "u-m", email: "me@example.com", role: "user" },
      ],
    });
    const add = (email: string) =>
      service.create({ familyId: FAM, name: "Someone", relationship: "Brother", email }, user({ id: "u-m", email: "me@example.com" }));
    assert.equal((await add("Someone@Example.com")).status, "PENDING");
    assert.equal((await add("me@example.com")).status, "ACTIVE");
  });
  test("a head can't add an active member of another family (that is a transfer) or an administrator's email", async () => {
    const { service } = build({
      users: [{ id: "u-admin", email: "admin@npsindore.org", role: "admin" }],
      members: [{ id: "x-1", familyId: "OTHER", email: "taken@example.com", mobileDigits: "9111111111", status: "ACTIVE" }],
    });
    const add = (extra: object) => service.create({ familyId: FAM, name: "Someone", relationship: "Brother", ...extra }, member());
    const elsewhere =
      "This mobile number or email already belongs to an active member of another family. To move them into your family, send a transfer request instead.";
    await rejectsWith(add({ email: "taken@example.com" }), 409, elsewhere);
    await rejectsWith(add({ mobile: "+91 91111 11111" }), 409, elsewhere);
    await rejectsWith(add({ email: "admin@npsindore.org" }), 409, "This email belongs to an administrator account and can't be added as a family member.");
    await rejectsWith(service.update("m-own", { email: "admin@npsindore.org" }, member()), 409, /administrator account/);
    assert.equal((await add({ email: "fresh@example.com" })).status, "ACTIVE");
  });
  test("a staff member with family access approves members of their villages' families: status only", async () => {
    const staffUser = user({ id: "u-staff" });
    const { service } = build({
      adminAccess: [{ userId: "u-staff", active: true, areas: ["FAMILIES"], allVillages: false, villages: ["Rampura"] }],
      families: [
        { familyId: FAM, village: "Rampura", status: "ACTIVE" },
        { familyId: "OTHER", village: "Khedi", status: "ACTIVE" },
      ],
    });
    assert.equal((await service.update("m-own", { status: "INACTIVE" }, staffUser)).status, "INACTIVE");
    await rejectsWith(service.update("m-other", { status: "ACTIVE" }, staffUser), 403, "This record belongs to a village outside your admin access.");
    // Anything beyond the status goes through the normal own-family rules (the staff member has no family here).
    await rejectsWith(service.update("m-own", { status: "ACTIVE", name: "X" }, staffUser), 403, "No family found for your account.");
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
  test("every change recounts the families involved, in the same transaction", async () => {
    const { service, repo } = build();
    const recounts = () => repo.recountFamilies.mock.calls.map((call) => call.arguments);
    await service.create({ familyId: FAM, name: "Kid", relationship: "Son" }, member());
    await service.update("m-own", { name: "Renamed" }, member());
    await service.update("m-other", { familyId: FAM }, admin());
    await service.remove("m-own", member());
    await service.createBatch([{ familyId: "F", name: "A", relationship: "Self" }]);
    assert.deepEqual(recounts(), [
      [[FAM], TX],
      [["OTHER", FAM], TX],
      [[FAM], TX],
      [["F"], TX],
    ]);
  });
});
