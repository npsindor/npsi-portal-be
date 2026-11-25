import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { AuthService } from "../auth/auth.service.js";
import type { ApplicantNotifier } from "../common/messaging/applicant-notifier.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { FamiliesRepository } from "../families/families.repository.js";
import type { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import type { StudentsRepository } from "../students/students.repository.js";
import { fakeAuth, fakeFees, fakeModelRepo, fakeNotifier, fakePrisma } from "../testing/fake-repo.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { applicationRow, familyMemberRow, familyRow, notificationRow, studentRow } from "../testing/rows.js";
import type { TransactionsRepository } from "../transactions/transactions.repository.js";
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
    { name: "Ram", relationship: "Self", dob: "1980-02-03", photoUrl: "/uploads/r.png", maritalStatus: "MARRIED" },
    { name: "Sita", relationship: "Wife", dob: "", maritalStatus: "single?" },
  ]),
});

const build = (application = pending, fee: { id: string; paymentStatus: string | null } | null = null, studentRows: ReturnType<typeof studentRow>[] = []) => {
  const applications = { ...fakeModelRepo(applicationRow, [{ ...application }]), linkToAccount: mock.fn(async (_id: string, _email: string) => {}) };
  const families = fakeModelRepo(familyRow);
  families.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-FAM-000023"]);
  const familyMembers = fakeModelRepo(familyMemberRow);
  familyMembers.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-MEM-000051"]); // old global ids play no part
  familyMembers.createMany.mock.mockImplementation(async (rows) => {
    const created = rows.map((data) => familyMemberRow(data));
    familyMembers.stored.push(...created);
    return created;
  });
  const notifications = fakeModelRepo(notificationRow);
  const auth = fakeAuth();
  const fees = fakeFees(fee);
  const notifier = fakeNotifier();
  const students = {
    ...fakeModelRepo(studentRow, studentRows),
    activeForUser: mock.fn(async (userId: string) => studentRows.find((row) => row.userId === userId && row.status !== "TRANSFERRED") ?? null),
  };
  const service = new ApplicationReviewService(
    as<PrismaService>(fakePrisma()),
    as<ApplicationsRepository>(applications),
    as<FamiliesRepository>(families),
    as<FamilyMembersRepository>(familyMembers),
    as<NotificationsRepository>(notifications),
    as<AuthService>(auth),
    as<TransactionsRepository>(fees),
    as<ApplicantNotifier>(notifier),
    as<StudentsRepository>(students),
  );
  return { service, applications, families, familyMembers, notifications, auth, fees, notifier, students };
};

describe("ApplicationReviewService", () => {
  test("approve: ACTIVE family and members from the application, approved, notified, invited", async () => {
    const { service, applications, families, familyMembers, notifications, auth } = build();
    const result = await service.review("app-1", { decision: "APPROVED", lang: "en" });
    assert.deepEqual(
      [result.family?.familyId, result.family?.status, result.family?.headName, result.family?.memberCount, result.family?.applicationId],
      ["NPSI-FAM-000024", "ACTIVE", "Ram", 2, "NPSI-APP-2026-000007"],
    );
    assert.deepEqual(
      result.members.map((m) => [m.membershipId, m.familyId, m.name, m.dob, m.photoUrl, m.status]),
      [
        ["NPSI-MEB-00002401", "NPSI-FAM-000024", "Ram", "1980-02-03", "/uploads/r.png", "ACTIVE"],
        ["NPSI-MEB-00002402", "NPSI-FAM-000024", "Sita", null, null, "ACTIVE"],
      ],
    );
    // The marital status asked on the form goes to the member; an unknown value is left empty.
    assert.deepEqual(
      result.members.map((m) => m.maritalStatus),
      ["MARRIED", null],
    );
    assert.deepEqual([result.application.status, result.application.resultingFamilyId], ["APPROVED", "NPSI-FAM-000024"]);
    assert.equal(families.stored.length, 1);
    assert.equal(familyMembers.stored.length, 2);
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].type], ["NPSI-FAM-000024", "Approval"]);
    assert.match(notifications.stored[0].message, /NPSI-FAM-000024/);
    assert.deepEqual(auth.invite.mock.calls[0].arguments[0], { email: "ram@example.com", role: "user", fullName: "Ram", phone: "9876500001" });
    // The new login owns the application, so it shows under the applicant's own registrations.
    assert.deepEqual(applications.linkToAccount.mock.calls[0].arguments, ["app-1", "ram@example.com"]);
  });
  test("a staff reviewer may only decide registrations from their villages", async () => {
    const scope = { superAdmin: false, areas: ["REGISTRATIONS" as const], allVillages: false, villages: ["Rampura"] };
    await rejectsWith(
      build({ ...pending, village: "Khedi", nativePlace: null }).service.review("app-1", { decision: "REJECTED", remarks: "x" }, scope),
      403,
      "This record belongs to a village outside your admin access.",
    );
    const inside = await build({ ...pending, village: "rampura" }).service.review("app-1", { decision: "REJECTED", remarks: "Wrong photo" }, scope);
    assert.equal(inside.application.status, "REJECTED");
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
  test("approval waits for a verified registration payment and then links it to the family", async () => {
    await rejectsWith(
      build(pending, { id: "t1", paymentStatus: "SUBMITTED" }).service.review("app-1", { decision: "APPROVED" }),
      409,
      "Verify the registration payment before approving this application.",
    );
    await rejectsWith(build(pending, { id: "t1", paymentStatus: "REJECTED" }).service.review("app-1", { decision: "APPROVED" }), 409, /Verify/);
    const { service, fees } = build(pending, { id: "t1", paymentStatus: "VERIFIED" });
    await service.review("app-1", { decision: "APPROVED" });
    assert.deepEqual(fees.update.mock.calls[0].arguments.slice(0, 2), ["t1", { familyId: "NPSI-FAM-000024" }]);
  });
  test("an account-first applicant owns the family, is notified on their account and is not re-invited", async () => {
    const { service, families, notifications, auth, notifier } = build(applicationRow({ ...pending, userId: "u-5", lang: "hi" }), {
      id: "t1",
      paymentStatus: "VERIFIED",
    });
    await service.review("app-1", { decision: "APPROVED", lang: "en" });
    assert.equal(families.stored[0].ownerUserId, "u-5");
    const own = notifications.stored.find((row) => row.recipientUserId === "u-5");
    assert.equal(own?.title, "आवेदन स्वीकृत!");
    assert.equal(auth.invite.mock.callCount(), 0);
    assert.equal(notifier.deliver.mock.callCount(), 1);
  });
  test("rejection of an older application is emailed / messaged to the applicant too", async () => {
    const { service, notifier } = build();
    await service.review("app-1", { decision: "REJECTED", remarks: "Duplicate" });
    const [message] = notifier.deliver.mock.calls[0].arguments[0] as { key: string; email: string }[];
    assert.deepEqual([message.key, message.email], ["applicationRejected", "ram@example.com"]);
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
  test("a student who registers as a member moves into the new family: student kept for the admin, TRANSFERRED and linked", async () => {
    const student = studentRow({ id: "s-1", studentId: "NPSI-STU-000004", userId: "u-5", status: "ACTIVE" });
    const { service, familyMembers, students } = build(applicationRow({ ...pending, userId: "u-5" }), { id: "t1", paymentStatus: "VERIFIED" }, [student]);
    const result = await service.review("app-1", { decision: "APPROVED" });
    const head = result.members[0];
    assert.equal(familyMembers.update.mock.calls[0].arguments[0], head.id);
    assert.deepEqual(familyMembers.update.mock.calls[0].arguments[1], { linkedStudentId: "NPSI-STU-000004" });
    assert.equal(students.stored.length, 1, "the student record is kept");
    assert.deepEqual(
      [students.stored[0].status, students.stored[0].linkedFamilyId, students.stored[0].linkedMembershipId],
      ["TRANSFERRED", "NPSI-FAM-000024", head.membershipId],
    );
  });
  test("an applicant without a student record is approved as before; other accounts' students are untouched", async () => {
    const other = studentRow({ id: "s-2", studentId: "NPSI-STU-000009", userId: "u-other", status: "ACTIVE" });
    const { service, familyMembers, students } = build(applicationRow({ ...pending, userId: "u-5" }), { id: "t1", paymentStatus: "VERIFIED" }, [other]);
    await service.review("app-1", { decision: "APPROVED" });
    assert.equal(familyMembers.update.mock.callCount(), 0);
    assert.equal(students.stored[0].status, "ACTIVE");
  });
});
