import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { AvailabilityService } from "../lookups/availability.service.js";
import { fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, fakeConfig, fakeMail, fakeRecaptcha, flush, rejectsWith } from "../testing/fakes.js";
import { applicationRow } from "../testing/rows.js";
import type { ApplicationsRepository } from "./applications.repository.js";
import { ApplicationsService } from "./applications.service.js";
import type { CreateApplicationDto } from "./dto/applications.dto.js";

const build = ({ recaptcha = true, mobileTaken = false, emailTaken = false } = {}) => {
  const repo = fakeModelRepo(applicationRow);
  repo.latestDisplayIds.mock.mockImplementation(async () => [`NPSI-APP-${new Date().getFullYear()}-000041`]);
  const mail = fakeMail();
  const availability = { isMobileTaken: mock.fn(async () => mobileTaken), isEmailTaken: mock.fn(async () => emailTaken) };
  const service = new ApplicationsService(
    as<ApplicationsRepository>(repo),
    as<AvailabilityService>(availability),
    fakeRecaptcha(recaptcha).service,
    mail.service,
    fakeConfig(),
  );
  return { service, repo, mail };
};
const application = (overrides: Partial<CreateApplicationDto> = {}): CreateApplicationDto => ({
  familyHeadName: "Head",
  mobile: "98765 00001",
  familyName: "Fam",
  email: "a@example.com",
  address: "A",
  city: "C",
  district: "D",
  recaptchaToken: "t",
  ...overrides,
});

describe("ApplicationsService.create", () => {
  test("public submission: next display id, PENDING_VERIFICATION, admin fields ignored, emails sent", async () => {
    const { service, mail } = build();
    const created = await service.create(application({ status: "APPROVED", adminRemarks: "self", resultingFamilyId: "F", membersData: [{ name: "X" }] }), null);
    assert.equal(created.applicationId, `NPSI-APP-${new Date().getFullYear()}-000042`);
    assert.deepEqual(
      [created.status, created.adminRemarks, created.resultingFamilyId, created.membersData],
      ["PENDING_VERIFICATION", null, null, [{ name: "X" }]],
    );
    await flush();
    assert.deepEqual(
      mail.send.mock.calls.map((call) => (call.arguments[0] as { to: string }).to),
      ["a@example.com", "admin@npsindore.org,info@npsindore.org"],
    );
  });
  test("admins keep the status they set", async () => {
    const created = await build().service.create(application({ status: "APPROVED" }), admin());
    assert.equal(created.status, "APPROVED");
  });
  test("reCAPTCHA, markup and validation messages, in order", async () => {
    await rejectsWith(build({ recaptcha: false }).service.create(application(), null), 400, "reCAPTCHA verification failed. Please try again.");
    const { service } = build();
    await rejectsWith(service.create(application({ city: "<b>" }), null), 400, 'The "city" field cannot contain < or > characters.');
    const cases: [Partial<CreateApplicationDto>, string][] = [
      [{ mobile: "12" }, "A valid 10-digit mobile number is required."],
      [{ familyName: " " }, "Family name is required."],
      [{ email: "nope" }, "A valid email address is required."],
      [{ address: "" }, "Address is required."],
      [{ city: "" }, "City is required."],
      [{ district: "" }, "District is required."],
      [{ familyHeadName: "" }, "Family head name is required."],
    ];
    for (const [overrides, message] of cases) await rejectsWith(service.create(application(overrides), null), 400, message);
  });
  test("mobile or email already registered: 409", async () => {
    await rejectsWith(build({ mobileTaken: true }).service.create(application(), null), 409, "This mobile number is already registered on the portal.");
    await rejectsWith(build({ emailTaken: true }).service.create(application(), null), 409, "This email is already registered on the portal.");
  });
  test("update and remove", async () => {
    const { service, repo } = build();
    const created = await service.create(application(), null);
    assert.equal((await service.update(created.id, { adminRemarks: "ok" })).adminRemarks, "ok");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    assert.equal((await service.list({})).length, 1);
    await service.remove(created.id);
    assert.equal(repo.delete.mock.callCount(), 1);
  });
});
