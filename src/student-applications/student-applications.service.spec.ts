import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { AvailabilityService } from "../lookups/availability.service.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import type { NotificationsRepository } from "../notifications/notifications.repository.js";
import { type FakeAccountRecords, fakeMembership, fakeModelRepo, fakePrisma } from "../testing/fake-repo.js";
import { admin, as, fakeRecaptcha, rejectsWith } from "../testing/fakes.js";
import { notificationRow, studentApplicationRow, transactionRow } from "../testing/rows.js";
import type { TransactionsRepository } from "../transactions/transactions.repository.js";
import type { CreateStudentApplicationDto } from "./dto/student-applications.dto.js";
import type { StudentApplicationsRepository } from "./student-applications.repository.js";
import { StudentApplicationsService } from "./student-applications.service.js";

const build = ({ recaptcha = true, mobileTaken = false, emailTaken = false, accounts = undefined as FakeAccountRecords | undefined } = {}) => {
  const repo = fakeModelRepo(studentApplicationRow);
  const availability = {
    isMobileTaken: mock.fn(async () => mobileTaken),
    isStudentMobileTaken: mock.fn(async () => mobileTaken),
    isEmailTaken: mock.fn(async () => emailTaken),
  };
  const notifications = fakeModelRepo(notificationRow);
  const fees = fakeModelRepo(transactionRow);
  const transactions = Object.assign(fees, {
    feesFor: mock.fn(async (ids: string[]) => fees.stored.filter((fee) => ids.includes(fee.referenceId ?? ""))),
  });
  const service = new StudentApplicationsService(
    as<PrismaService>(fakePrisma(accounts)),
    as<StudentApplicationsRepository>(repo),
    as<NotificationsRepository>(notifications),
    as<AvailabilityService>(availability),
    as<MembershipRepository>(fakeMembership()),
    fakeRecaptcha(recaptcha).service,
    as<TransactionsRepository>(transactions),
  );
  return { service, repo, notifications, transactions };
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
  test("a student can't register with the email of a Family Member login (it would become that login's student)", async () => {
    const accounts = {
      users: [{ id: "u-parent", email: "s@example.com", role: "user", status: "active" }],
      families: [{ ownerUserId: "u-parent", familyId: "F1", status: "ACTIVE" }],
    };
    const { service, repo } = build({ accounts });
    await rejectsWith(
      service.create(student({ recaptchaToken: "t" }), null),
      409,
      "This email is already the login of an NPS Family Member account. Enter the student's own email so they get a separate Student Login.",
    );
    assert.equal(repo.create.mock.callCount(), 0);
    const studentLogin = build({ accounts: { users: [{ id: "u-s", email: "s@example.com", role: "user", status: "active" }] } });
    await studentLogin.service.create(student({ recaptchaToken: "t" }), null);
    assert.equal(studentLogin.repo.create.mock.callCount(), 1, "an account without a family registration is fine");
  });

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
  test("public submission records the PENDING ₹100 student fee (approval waits for it); admin entries don't", async () => {
    const pub = build();
    const created = await pub.service.create(student(), null);
    const [fee] = pub.transactions.stored;
    assert.deepEqual(
      [fee.type, fee.amount.toNumber(), fee.paymentStatus, fee.referenceId, fee.transactionId],
      ["Student Registration", 100, "PENDING", created.applicationId, "TXN-000001"],
    );
    const [listed] = await pub.service.list({});
    assert.deepEqual(listed.payment, {
      id: fee.id,
      transactionId: "TXN-000001",
      amount: 100,
      status: "PENDING",
      utr: null,
      hasScreenshot: false,
      adminRemarks: null,
    });
    const asAdmin = build();
    await asAdmin.service.create(student(), admin());
    assert.equal(asAdmin.transactions.stored.length, 0);
    assert.equal((await asAdmin.service.list({}))[0].payment, null);
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
