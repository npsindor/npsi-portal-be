import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { FamiliesRepository } from "../families/families.repository.js";
import type { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import type { StudentsRepository } from "../students/students.repository.js";
import { fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { admin, as, rejectsWith } from "../testing/fakes.js";
import { familyMemberRow, familyRow, notificationRow, studentRow, transferRequestRow } from "../testing/rows.js";
import { TransferRequestReviewService } from "./transfer-request-review.service.js";
import type { TransferRequestsRepository } from "./transfer-requests.repository.js";

const familyMove = transferRequestRow({
  id: "tr-1",
  requestId: "TRF-000001",
  requestType: "family_to_family",
  sourceMembershipId: "NPSI-MEM-000005",
  targetFamilyId: "NPSI-FAM-000002",
});
const studentMove = transferRequestRow({
  id: "tr-2",
  requestId: "TRF-000002",
  requestType: "student_to_family",
  sourceStudentId: "NPSI-STU-000003",
  targetFamilyId: "NPSI-FAM-000002",
});

const build = (requests = [familyMove, studentMove]) => {
  const transferRequests = fakeModelRepo(
    transferRequestRow,
    requests.map((r) => ({ ...r })),
  );
  const families = {
    ...fakeModelRepo(familyRow, [
      familyRow({ id: "f-1", familyId: "NPSI-FAM-000001", familyName: "Old", memberCount: 3, status: "ACTIVE" }),
      familyRow({ id: "f-2", familyId: "NPSI-FAM-000002", familyName: "New", memberCount: 1, status: "ACTIVE" }),
    ]),
    findByFamilyId: async (familyId: string, _db?: unknown, status?: string) =>
      [
        familyRow({ id: "f-1", familyId: "NPSI-FAM-000001", familyName: "Old", status: "ACTIVE" }),
        familyRow({ id: "f-2", familyId: "NPSI-FAM-000002", familyName: "New", status: "ACTIVE" }),
      ].find((f) => f.familyId === familyId && (!status || f.status === status)) ?? null,
  };
  const familyMembers = {
    ...fakeModelRepo(familyMemberRow, [familyMemberRow({ id: "m-5", membershipId: "NPSI-MEM-000005", familyId: "NPSI-FAM-000001", status: "PENDING" })]),
    findByMembershipId: async (membershipId: string) =>
      membershipId === "NPSI-MEM-000005" ? familyMemberRow({ id: "m-5", membershipId, familyId: "NPSI-FAM-000001" }) : null,
    hasContactInFamily: async (_familyId: string, mobile: string | null) => mobile === "9000000000",
  };
  familyMembers.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-MEM-000051"]);
  const students = {
    ...fakeModelRepo(studentRow, [studentRow({ id: "s-3", studentId: "NPSI-STU-000003", studentName: "Asha", mobile: "9111111111", status: "ACTIVE" })]),
    findByStudentId: async (studentId: string) =>
      studentId === "NPSI-STU-000003" ? studentRow({ id: "s-3", studentId, studentName: "Asha", mobile: "9111111111" }) : null,
  };
  const notifications = fakeModelRepo(notificationRow);
  const service = new TransferRequestReviewService(
    as<PrismaService>(fakePrisma()),
    as<TransferRequestsRepository>(transferRequests),
    as<FamiliesRepository>(families),
    as<FamilyMembersRepository>(familyMembers),
    as<StudentsRepository>(students),
    as<NotificationsRepository>(notifications),
  );
  return { service, families, familyMembers, students, notifications };
};

describe("TransferRequestReviewService", () => {
  test("family_to_family: member moves, both counts follow, target notified", async () => {
    const { service, familyMembers, notifications } = build();
    const result = await service.review("tr-1", { decision: "APPROVED", remarks: "ok" }, admin());
    assert.deepEqual(
      [result.status, result.oldFamilyId, result.newFamilyId, result.approvedById, result.adminRemarks],
      ["APPROVED", "NPSI-FAM-000001", "NPSI-FAM-000002", "u-admin", "ok"],
    );
    assert.ok(result.approvedDate instanceof Date);
    assert.deepEqual([familyMembers.stored[0].familyId, familyMembers.stored[0].status], ["NPSI-FAM-000002", "ACTIVE"]);
    assert.deepEqual(familyMembers.recountFamilies.mock.calls[0].arguments[0], ["NPSI-FAM-000001", "NPSI-FAM-000002"]);
    assert.equal(notifications.stored[0].recipientFamilyId, "NPSI-FAM-000002");
    assert.match(notifications.stored[0].message, /NPSI-FAM-000001.*New/);
  });
  test("student_to_family: student becomes a member of the target family and is marked TRANSFERRED", async () => {
    const { service, familyMembers, students, notifications } = build();
    const result = await service.review("tr-2", { decision: "APPROVED" }, admin());
    const member = familyMembers.stored.at(-1);
    assert.deepEqual(
      [member?.membershipId, member?.familyId, member?.name, member?.linkedStudentId],
      ["NPSI-MEM-000052", "NPSI-FAM-000002", "Asha", "NPSI-STU-000003"],
    );
    assert.deepEqual(
      [students.stored[0].status, students.stored[0].linkedFamilyId, students.stored[0].linkedMembershipId],
      ["TRANSFERRED", "NPSI-FAM-000002", "NPSI-MEM-000052"],
    );
    assert.deepEqual([result.resultingMembershipId, result.newFamilyId], ["NPSI-MEM-000052", "NPSI-FAM-000002"]);
    assert.deepEqual(familyMembers.recountFamilies.mock.calls[0].arguments[0], ["NPSI-FAM-000002"]);
    assert.match(notifications.stored[0].message, /NPSI-MEM-000052/);
  });
  test("reject / correction need remarks and change nothing else", async () => {
    const { service, familyMembers, notifications } = build();
    await rejectsWith(service.review("tr-1", { decision: "REJECTED" }, admin()), 400, "Remarks are required to reject or ask for a correction.");
    const result = await service.review("tr-1", { decision: "REJECTED", remarks: "No" }, admin());
    assert.deepEqual([result.status, result.adminRemarks], ["REJECTED", "No"]);
    assert.deepEqual([familyMembers.stored[0].familyId, notifications.stored.length], ["NPSI-FAM-000001", 0]);
  });
  test("404s and 409s", async () => {
    await rejectsWith(build().service.review("missing", { decision: "APPROVED" }, admin()), 404, "Transfer request not found.");
    await rejectsWith(
      build([{ ...familyMove, status: "APPROVED" }]).service.review("tr-1", { decision: "APPROVED" }, admin()),
      409,
      "This transfer request has already been approved.",
    );
    await rejectsWith(
      build([{ ...familyMove, targetFamilyId: "GONE" }]).service.review("tr-1", { decision: "APPROVED" }, admin()),
      404,
      "Target family not found.",
    );
    await rejectsWith(
      build([{ ...familyMove, sourceMembershipId: "X" }]).service.review("tr-1", { decision: "APPROVED" }, admin()),
      404,
      "Source member not found.",
    );
    await rejectsWith(
      build([{ ...studentMove, sourceStudentId: "X" }]).service.review("tr-2", { decision: "APPROVED" }, admin()),
      404,
      "Source student not found.",
    );
    const dup = build();
    dup.students.findByStudentId = async (studentId: string) => studentRow({ id: "s-3", studentId, mobile: "9000000000" });
    await rejectsWith(dup.service.review("tr-2", { decision: "APPROVED" }, admin()), 409, "This person is already a member of the target family.");
  });
});
