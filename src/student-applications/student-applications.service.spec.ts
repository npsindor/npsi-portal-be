import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { AvailabilityService } from "../lookups/availability.service.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import { fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { admin, as, fakeRecaptcha, rejectsWith } from "../testing/fakes.js";
import { notificationRow, studentApplicationRow } from "../testing/rows.js";
import type { CreateStudentApplicationDto } from "./dto/student-applications.dto.js";
import type { StudentApplicationsRepository } from "./student-applications.repository.js";
import { StudentApplicationsService } from "./student-applications.service.js";

const build = ({ recaptcha = true, mobileTaken = false, emailTaken = false } = {}) => {
  const repo = fakeModelRepo(studentApplicationRow);
  const availability = { isMobileTaken: mock.fn(async () => mobileTaken), isEmailTaken: mock.fn(async () => emailTaken) };
  const notifications = fakeModelRepo(notificationRow);
  const service = new StudentApplicationsService(
    as<PrismaService>(fakePrisma()),
    as<StudentApplicationsRepository>(repo),
    as<NotificationsRepository>(notifications),
    as<AvailabilityService>(availability),
    fakeRecaptcha(recaptcha).service,
  );
  return { service, repo, notifications };
};
const student = (overrides: Partial<CreateStudentApplicationDto> = {}): CreateStudentApplicationDto => ({
  studentName: "S",
  mobile: "9876500002",
  email: "s@example.com",
  gender: "M",
  fatherName: "F",
  academicYear: "2026",
  dob: "2010-04-05",
  ...overrides,
});

describe("StudentApplicationsService", () => {
  test("public submission: first display id of the year, PENDING_VERIFICATION, DATE as YYYY-MM-DD", async () => {
    const created = await build().service.create(student({ status: "APPROVED", resultingStudentId: "X" }), null);
    assert.equal(created.applicationId, `NPSI-STU-APP-${new Date().getFullYear()}-000001`);
    assert.deepEqual([created.status, created.resultingStudentId, created.dob], ["PENDING_VERIFICATION", null, "2010-04-05"]);
    assert.equal((await build().service.create(student({ status: "APPROVED" }), admin())).status, "APPROVED");
  });
  test("public submission also sends the 'submitted' notification; admin creates don't", async () => {
    const pub = build();
    const created = await pub.service.create(student(), null);
    assert.deepEqual([pub.notifications.stored[0].recipientFamilyId, pub.notifications.stored[0].type], [created.applicationId, "Registration"]);
    const asAdmin = build();
    await asAdmin.service.create(student(), admin());
    assert.equal(asAdmin.notifications.stored.length, 0);
  });
  test("validation messages, in order; reCAPTCHA; duplicates", async () => {
    const { service } = build();
    const cases: [Partial<CreateStudentApplicationDto>, string][] = [
      [{ studentName: "" }, "Student name is required."],
      [{ mobile: "1" }, "A valid 10-digit mobile number is required."],
      [{ guardianMobile: "12" }, "Guardian mobile number must be a valid 10-digit number."],
      [{ email: "x" }, "A valid email address is required."],
      [{ gender: "" }, "Gender is required."],
      [{ fatherName: "" }, "Father's name is required."],
      [{ academicYear: "" }, "Academic year is required."],
    ];
    for (const [overrides, message] of cases) await rejectsWith(service.create(student(overrides), null), 400, message);
    await rejectsWith(build({ recaptcha: false }).service.create(student(), null), 400, "reCAPTCHA verification failed. Please try again.");
    await rejectsWith(build({ mobileTaken: true }).service.create(student(), null), 409, "This mobile number is already registered on the portal.");
    await rejectsWith(build({ emailTaken: true }).service.create(student(), null), 409, "This email is already registered on the portal.");
  });
  test("list, update, remove", async () => {
    const { service } = build();
    const created = await service.create(student(), null);
    assert.equal((await service.list({ order: "-submittedDate" })).length, 1);
    assert.equal((await service.update(created.id, { adminRemarks: "ok" })).adminRemarks, "ok");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    await service.remove(created.id);
  });
});
