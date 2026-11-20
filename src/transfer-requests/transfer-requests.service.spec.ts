import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { FamiliesRepository } from "../families/families.repository.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import { FAM, fakeMembership, fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { familyRow, notificationRow, transferRequestRow } from "../testing/rows.js";
import type { CreateTransferRequestDto } from "./dto/transfer-requests.dto.js";
import type { TransferRequestsRepository } from "./transfer-requests.repository.js";
import { TransferRequestsService } from "./transfer-requests.service.js";

const member = () => user({ id: "u-m", email: "member@example.com", fullName: "Real Name", phone: "9876543210" });
const build = () => {
  const base = fakeModelRepo(transferRequestRow);
  const repo = {
    ...base,
    findOpen: mock.fn(async (openKey: string) => base.stored.find((row) => row.openKey === openKey) ?? null),
    recordDisplayId: mock.fn(async (..._args: unknown[]) => undefined),
    countByRequesterSince: mock.fn(async (..._args: unknown[]) => 0),
  };
  const families = {
    findByFamilyId: async (familyId: string) => (familyId === "TARGET" || familyId === FAM ? familyRow({ familyId, status: "ACTIVE" }) : null),
  };
  const notifications = fakeModelRepo(notificationRow);
  const service = new TransferRequestsService(
    as<PrismaService>(fakePrisma()),
    as<TransferRequestsRepository>(repo),
    as<MembershipRepository>(fakeMembership()),
    as<FamiliesRepository>(families),
    as<NotificationsRepository>(notifications),
  );
  return { service, repo, notifications };
};
const request = (overrides: Partial<CreateTransferRequestDto> = {}): CreateTransferRequestDto => ({
  requestType: "family_to_family",
  targetFamilyId: "TARGET",
  ...overrides,
});

describe("TransferRequestsService.create", () => {
  test("members: their own family, member or student; always PENDING, requested by them", async () => {
    const { service, repo } = build();
    const created = await service.create(
      request({ sourceFamilyId: "OTHER", sourceMembershipId: "NPSI-MEM-000001", status: "APPROVED", adminRemarks: "x" }),
      member(),
    );
    assert.deepEqual([created.requestId, created.status, created.requesterId, created.adminRemarks], ["TRF-000001", "PENDING", "u-m", null]);
    assert.equal(created.sourceFamilyId, FAM, "the source family is the requester's own, not what the form says");
    assert.equal(repo.stored[0].openKey, "M:NPSI-MEM-000001");
    assert.deepEqual(repo.recordDisplayId.mock.calls[0].arguments.slice(0, 2), ["TRF-", "TRF-000001"]);
    await service.create(request({ requestType: "student_to_family", sourceStudentId: "STU-OWN" }), member());
    await service.create(request({ requestType: "student_to_family", sourceStudentId: "STU-FAM" }), member());
  });
  test("members: requester name, email and mobile come from the session, never the form", async () => {
    const { service } = build();
    const created = await service.create(
      request({ sourceMembershipId: "NPSI-MEM-000001", requesterName: "Admin Spoof", requesterEmail: "admin@npsindore.org", requesterMobile: "9000000000" }),
      member(),
    );
    assert.deepEqual([created.requesterName, created.requesterEmail, created.requesterMobile], ["Real Name", "member@example.com", "9876543210"]);
  });
  test("one open request per member: a second one is a 409 that names the first", async () => {
    const { service, repo } = build();
    const first = await service.create(request({ sourceMembershipId: "NPSI-MEM-000001" }), member());
    await rejectsWith(
      service.create(request({ sourceMembershipId: "NPSI-MEM-000001" }), member()),
      409,
      `A transfer request for this member is already pending (${first.requestId}) and is under admin review.`,
    );
    assert.equal(repo.stored.length, 1);
  });
  test("simultaneous submissions: the unique key refuses the second, reported as the same 409", async () => {
    const { service, repo } = build();
    const winner = transferRequestRow({ id: "won", requestId: "TRF-000007", openKey: "M:NPSI-MEM-000001" });
    let calls = 0;
    repo.findOpen.mock.mockImplementation(async () => (calls++ === 0 ? null : winner));
    repo.create.mock.mockImplementation(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });
    await rejectsWith(
      service.create(request({ sourceMembershipId: "NPSI-MEM-000001" }), member()),
      409,
      "A transfer request for this member is already pending (TRF-000007) and is under admin review.",
    );
  });
  test("request type is checked: a member transfer needs a member, a student transfer the student's record, both a target", async () => {
    const { service } = build();
    await rejectsWith(service.create(request(), member()), 400, "Choose the family member to transfer.");
    await rejectsWith(service.create(request({ requestType: "student_to_family" }), member()), 400, "Choose the student record to transfer.");
    await rejectsWith(
      service.create(request({ targetFamilyId: "", sourceMembershipId: "NPSI-MEM-000001" }), member()),
      400,
      "Choose the family to transfer to.",
    );
    await rejectsWith(
      service.create(request({ requestType: "student_to_family", sourceStudentId: "NPSI-MEM-000001" }), member()),
      403,
      "You can only request a transfer for your own student record.",
    );
    await rejectsWith(
      service.create(request({ targetFamilyId: FAM, sourceMembershipId: "NPSI-MEM-000001" }), member()),
      400,
      "The member is already in this family.",
    );
  });
  test("members file at most 5 requests an hour", async () => {
    const { service, repo } = build();
    repo.countByRequesterSince.mock.mockImplementation(async () => 5);
    await rejectsWith(service.create(request({ sourceMembershipId: "NPSI-MEM-000001" }), member()), 429, "Too many transfer requests. Please try again later.");
  });
  test("members: the target family must exist, and is notified", async () => {
    const { service, notifications } = build();
    const created = await service.create(request({ lang: "hi", sourceMembershipId: "NPSI-MEM-000001" }), member());
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].title], ["TARGET", "नया ट्रांसफर अनुरोध"]);
    assert.match(notifications.stored[0].message, new RegExp(created.requestId));
    await rejectsWith(
      service.create(request({ targetFamilyId: "GONE", sourceStudentId: "STU-OWN", requestType: "student_to_family" }), member()),
      404,
      "Target family not found.",
    );
  });
  test("members: anything else is refused", async () => {
    const { service } = build();
    await rejectsWith(
      service.create(request({ sourceMembershipId: "NPSI-MEM-000002" }), member()),
      403,
      "You can only request a transfer for a member of your own family.",
    );
    await rejectsWith(
      service.create(request({ sourceMembershipId: "NPSI-MEM-404" }), member()),
      403,
      "You can only request a transfer for a member of your own family.",
    );
    const student = { requestType: "student_to_family" };
    await rejectsWith(
      service.create(request({ ...student, sourceStudentId: "STU-OTHER" }), member()),
      403,
      "You can only request a transfer for your own student record.",
    );
    await rejectsWith(
      service.create(request({ ...student, sourceStudentId: "STU-404" }), member()),
      403,
      "You can only request a transfer for your own student record.",
    );
    await rejectsWith(service.create(request({ reason: "<b>" }), member()), 400, 'The "reason" field cannot contain < or > characters.');
  });
  test("admins: as sent; list, update, remove; PATCH can't decide a request (status ignored)", async () => {
    const { service } = build();
    const created = await service.create(request({ status: "APPROVED" }), admin());
    assert.equal(created.status, "APPROVED");
    assert.equal((await service.list({ order: "-requestedDate" })).length, 1);
    assert.equal((await service.update(created.id, { adminRemarks: "done" })).adminRemarks, "done");
    const pending = await service.create(request({ sourceMembershipId: "NPSI-MEM-000009" }), admin());
    assert.equal((await service.update(pending.id, { status: "APPROVED" })).status, "PENDING");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    await service.remove(created.id);
  });
});
