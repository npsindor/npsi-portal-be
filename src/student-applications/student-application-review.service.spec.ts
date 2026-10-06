import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AuthService } from "../auth/auth.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import type { StudentsRepository } from "../students/students.repository.js";
import { fakeAuth, fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { notificationRow, studentApplicationRow, studentRow } from "../testing/rows.js";
import { StudentApplicationReviewService } from "./student-application-review.service.js";
import type { StudentApplicationsRepository } from "./student-applications.repository.js";

const pending = studentApplicationRow({
  id: "sa-1",
  applicationId: "NPSI-STU-APP-2026-000003",
  status: "PENDING_VERIFICATION",
  studentName: "Asha",
  mobile: "",
  guardianMobile: "9876500009",
  email: "asha@example.com",
  dob: new Date("2010-04-05T00:00:00Z"),
});

const build = (application = pending) => {
  const applications = fakeModelRepo(studentApplicationRow, [{ ...application }]);
  const students = fakeModelRepo(studentRow);
  students.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-STU-000011"]);
  const notifications = fakeModelRepo(notificationRow);
  const auth = fakeAuth();
  const service = new StudentApplicationReviewService(
    as<PrismaService>(fakePrisma()),
    as<StudentApplicationsRepository>(applications),
    as<StudentsRepository>(students),
    as<NotificationsRepository>(notifications),
    as<AuthService>(auth),
  );
  return { service, students, notifications, auth };
};

describe("StudentApplicationReviewService", () => {
  test("approve: ACTIVE student from the application, approved, notified, invited with the guardian's mobile", async () => {
    const { service, notifications, auth } = build();
    const result = await service.review("sa-1", { decision: "APPROVED" });
    assert.deepEqual(
      [result.student?.studentId, result.student?.status, result.student?.studentName, result.student?.dob, result.student?.applicationId],
      ["NPSI-STU-000012", "ACTIVE", "Asha", "2010-04-05", "NPSI-STU-APP-2026-000003"],
    );
    assert.deepEqual([result.application.status, result.application.resultingStudentId], ["APPROVED", "NPSI-STU-000012"]);
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].type], ["NPSI-STU-000012", "Approval"]);
    assert.deepEqual(auth.invite.mock.calls[0].arguments[0], { email: "asha@example.com", role: "user", fullName: "Asha", phone: "9876500009" });
  });
  test("reject / correction need remarks and notify the applicant", async () => {
    const { service, students, notifications } = build();
    await rejectsWith(service.review("sa-1", { decision: "CORRECTION_REQUIRED" }), 400, "Remarks are required to reject or ask for a correction.");
    const result = await service.review("sa-1", { decision: "CORRECTION_REQUIRED", remarks: "Add photo", lang: "hi" });
    assert.deepEqual([result.application.status, result.student], ["CORRECTION_REQUIRED", null]);
    assert.deepEqual([notifications.stored[0].recipientFamilyId, notifications.stored[0].title], ["NPSI-STU-APP-2026-000003", "सुधार आवश्यक"]);
    await service.review("sa-1", { decision: "REJECTED", remarks: "No" });
    assert.equal(students.stored.length, 0);
  });
  test("404 when missing, 409 when already approved", async () => {
    await rejectsWith(build().service.review("missing", { decision: "APPROVED" }), 404, "Application not found.");
    await rejectsWith(
      build({ ...pending, status: "APPROVED" }).service.review("sa-1", { decision: "APPROVED" }),
      409,
      "This application has already been approved.",
    );
  });
});
