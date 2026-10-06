import assert from "node:assert/strict";
import { describe, test } from "node:test";
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

const member = () => user({ id: "u-m", email: "member@example.com" });
const build = () => {
  const repo = fakeModelRepo(transferRequestRow);
  const families = { findByFamilyId: async (familyId: string) => (familyId === "TARGET" ? familyRow({ familyId, status: "ACTIVE" }) : null) };
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
    const { service } = build();
    const created = await service.create(
      request({ sourceFamilyId: FAM, sourceMembershipId: "NPSI-MEM-000001", status: "APPROVED", adminRemarks: "x" }),
      member(),
    );
    assert.deepEqual([created.requestId, created.status, created.requesterId, created.adminRemarks], ["TRF-000001", "PENDING", "u-m", null]);
    await service.create(request({ requestType: "student_to_family", sourceStudentId: "STU-OWN" }), member());
    await service.create(request({ requestType: "student_to_family", sourceStudentId: "STU-FAM" }), member());
  });
  test("members: the target family must exist, and is notified", async () => {
    const { service, notifications } = build();
    const created = await service.create(request({ lang: "hi" }), member());
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].title], ["TARGET", "नया ट्रांसफर अनुरोध"]);
    assert.match(notifications.stored[0].message, new RegExp(created.requestId));
    await rejectsWith(service.create(request({ targetFamilyId: "GONE" }), member()), 404, "Target family not found.");
  });
  test("members: anything else is refused", async () => {
    const { service } = build();
    await rejectsWith(service.create(request({ sourceFamilyId: "OTHER" }), member()), 403, "You can only request a transfer for your own family.");
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
    await rejectsWith(service.create(request({ sourceStudentId: "STU-OTHER" }), member()), 403, "You can only request a transfer for your own student record.");
    await rejectsWith(service.create(request({ sourceStudentId: "STU-404" }), member()), 403, "You can only request a transfer for your own student record.");
    await rejectsWith(service.create(request({ reason: "<b>" }), member()), 400, 'The "reason" field cannot contain < or > characters.');
  });
  test("admins: as sent; list, update, remove", async () => {
    const { service } = build();
    const created = await service.create(request({ status: "APPROVED" }), admin());
    assert.equal(created.status, "APPROVED");
    assert.equal((await service.list({ order: "-requestedDate" })).length, 1);
    assert.equal((await service.update(created.id, { adminRemarks: "done" })).adminRemarks, "done");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    await service.remove(created.id);
  });
});
