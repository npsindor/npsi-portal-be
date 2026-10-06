import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AuthService } from "../auth/auth.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { FamiliesRepository } from "../families/families.repository.js";
import type { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import { fakeAuth, fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { applicationRow, familyMemberRow, familyRow, notificationRow } from "../testing/rows.js";
import { ApplicationReviewService } from "./application-review.service.js";
import type { ApplicationsRepository } from "./applications.repository.js";

const pending = applicationRow({
  id: "app-1",
  applicationId: "NPSI-APP-2026-000007",
  status: "PENDING_VERIFICATION",
  familyHeadName: "Ram",
  familyName: "Patidar",
  mobile: "9876500001",
  email: "ram@example.com",
  city: "Indore",
  membersData: JSON.stringify([
    { name: "Ram", relationship: "Self", dob: "1980-02-03", photoUrl: "/uploads/r.png" },
    { name: "Sita", relationship: "Wife", dob: "" },
  ]),
});

const build = (application = pending) => {
  const applications = fakeModelRepo(applicationRow, [{ ...application }]);
  const families = fakeModelRepo(familyRow);
  families.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-FAM-000023"]);
  const familyMembers = fakeModelRepo(familyMemberRow);
  familyMembers.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-MEM-000051"]);
  familyMembers.createMany.mock.mockImplementation(async (rows) => {
    const created = rows.map((data) => familyMemberRow(data));
    familyMembers.stored.push(...created);
    return created;
  });
  const notifications = fakeModelRepo(notificationRow);
  const auth = fakeAuth();
  const service = new ApplicationReviewService(
    as<PrismaService>(fakePrisma()),
    as<ApplicationsRepository>(applications),
    as<FamiliesRepository>(families),
    as<FamilyMembersRepository>(familyMembers),
    as<NotificationsRepository>(notifications),
    as<AuthService>(auth),
  );
  return { service, applications, families, familyMembers, notifications, auth };
};

describe("ApplicationReviewService", () => {
  test("approve: ACTIVE family and members from the application, approved, notified, invited", async () => {
    const { service, families, familyMembers, notifications, auth } = build();
    const result = await service.review("app-1", { decision: "APPROVED", lang: "en" });
    assert.deepEqual(
      [result.family?.familyId, result.family?.status, result.family?.headName, result.family?.memberCount, result.family?.applicationId],
      ["NPSI-FAM-000024", "ACTIVE", "Ram", 2, "NPSI-APP-2026-000007"],
    );
    assert.deepEqual(
      result.members.map((m) => [m.membershipId, m.familyId, m.name, m.dob, m.photoUrl, m.status]),
      [
        ["NPSI-MEM-000052", "NPSI-FAM-000024", "Ram", "1980-02-03", "/uploads/r.png", "ACTIVE"],
        ["NPSI-MEM-000053", "NPSI-FAM-000024", "Sita", null, null, "ACTIVE"],
      ],
    );
    assert.deepEqual([result.application.status, result.application.resultingFamilyId], ["APPROVED", "NPSI-FAM-000024"]);
    assert.equal(families.stored.length, 1);
    assert.equal(familyMembers.stored.length, 2);
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].type], ["NPSI-FAM-000024", "Approval"]);
    assert.match(notifications.stored[0].message, /NPSI-FAM-000024/);
    assert.deepEqual(auth.invite.mock.calls[0].arguments[0], { email: "ram@example.com", role: "user", fullName: "Ram", phone: "9876500001" });
  });
  test("reject / correction: remarks required, recorded and sent to the applicant; nothing else created", async () => {
    const { service, families, notifications, auth } = build();
    await rejectsWith(service.review("app-1", { decision: "REJECTED", remarks: "  " }), 400, "Remarks are required to reject or ask for a correction.");
    const rejected = await service.review("app-1", { decision: "REJECTED", remarks: "Duplicate", lang: "hi" });
    assert.deepEqual([rejected.application.status, rejected.application.adminRemarks, rejected.family], ["REJECTED", "Duplicate", null]);
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].title], ["NPSI-APP-2026-000007", "आवेदन अस्वीकृत"]);
    const corrected = await service.review("app-1", { decision: "CORRECTION_REQUIRED", remarks: "Add photo" });
    assert.equal(corrected.application.status, "CORRECTION_REQUIRED");
    assert.match(notifications.stored[1].message, /Add photo/);
    assert.deepEqual([families.stored.length, auth.invite.mock.callCount()], [0, 0]);
  });
  test("404 when missing, 409 when already approved; an invite failure doesn't fail the approval", async () => {
    await rejectsWith(build().service.review("missing", { decision: "APPROVED" }), 404, "Application not found.");
    await rejectsWith(
      build(applicationRow({ ...pending, status: "APPROVED" })).service.review("app-1", { decision: "APPROVED" }),
      409,
      "This application has already been approved.",
    );
    const { service, auth } = build();
    auth.invite.mock.mockImplementation(async () => Promise.reject(new Error("smtp down")));
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      assert.equal((await service.review("app-1", { decision: "APPROVED" })).application.status, "APPROVED");
    } finally {
      console.error = original;
    }
    assert.equal(errors.length, 1);
  });
});
