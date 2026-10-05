import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { as, rejectsWith } from "../../testing/fakes.js";
import { AvailabilityService } from "./availability.service.js";
import type { LookupsRepository } from "./lookups.repository.js";
import { LookupsService } from "./lookups.service.js";

const fakeRepo = () => ({
  publicFamily: mock.fn(async (id: string) =>
    id === "NPSI-FAM-000001" ? { family_id: id, family_name: "F", head_name: "H", status: "ACTIVE", city: "Indore", registration_date: null } : undefined,
  ),
  publicMembers: mock.fn(async () => [{ name: "M", relationship: "Self", gender: "Male", status: "ACTIVE" }]),
  application: mock.fn(async (id: string, mobile: string) =>
    id === "APP-1" && mobile === "9876543210" ? { id: "a1", application_id: id, members_data: '[{"n":1}]', created_at: "c", updated_at: "u" } : undefined,
  ),
  activeCounts: mock.fn(async () => ({ families: 3, members: 9 })),
  mobileCheckSources: mock.fn(async () => [
    [
      { mobile: "9000000001", status: "SUBMITTED" },
      { mobile: "9000000009", status: "REJECTED" },
    ],
    [{ contact_number: "+91 90000 00002" }],
    [{ mobile: "9000000003" }],
    [
      { mobile: "9000000004", status: "SUBMITTED" },
      { mobile: "9000000008", status: "REJECTED" },
    ],
    [{ mobile: "9000000005" }],
  ]),
  mobileTakenSources: mock.fn(async () => [
    [
      { id: "a1", mobile: "9000000001", status: "SUBMITTED" },
      { id: "a2", mobile: "9000000009", status: "REJECTED" },
    ],
    [{ contact_number: "9000000002" }],
    [{ mobile: "9000000003" }],
  ]),
  emailTakenSources: mock.fn(async () => [
    [
      { id: "a1", email: "app@x.com", status: "SUBMITTED" },
      { id: "a2", email: "rejected@x.com", status: "REJECTED" },
    ],
    [{ email: "family@x.com" }],
    [{ email: "member@x.com" }],
    [{ id: "s1", email: "stuapp@x.com", status: "SUBMITTED" }],
    [{ email: "student@x.com" }],
    [{ email: "USER@x.com" }],
  ]),
});

const build = () => {
  const repo = fakeRepo();
  const availability = new AvailabilityService(as<LookupsRepository>(repo));
  return { repo, availability, service: new LookupsService(as<LookupsRepository>(repo), availability) };
};

describe("LookupsService", () => {
  test("verifyFamily returns the public summary or 404", async () => {
    const { service } = build();
    const result = await service.verifyFamily("NPSI-FAM-000001");
    assert.equal(result.family.family_id, "NPSI-FAM-000001");
    assert.equal(result.members.length, 1);
    await rejectsWith(service.verifyFamily("NPSI-FAM-999999"), 404, "No family found for this ID.");
  });
  test("applicationStatus validates input and maps the record", async () => {
    const { service } = build();
    await rejectsWith(service.applicationStatus({ applicationId: "APP-1" }), 400, "Application ID and mobile number are required.");
    await rejectsWith(service.applicationStatus({ mobile: " " }), 400, "Application ID and mobile number are required.");
    await rejectsWith(service.applicationStatus({ applicationId: "APP-1", mobile: "1" }), 404, "No application found for this ID and mobile number.");
    assert.deepEqual(await service.applicationStatus({ applicationId: " APP-1 ", mobile: " 9876543210 " }), {
      id: "a1",
      application_id: "APP-1",
      members_data: [{ n: 1 }],
      created_date: "c",
      updated_date: "u",
    });
  });
  test("availability checks and stats", async () => {
    const { service } = build();
    assert.deepEqual(await service.mobileAvailability({ mobile: "90000 00002" }), { taken: true });
    assert.deepEqual(await service.mobileAvailability({}), { taken: false });
    assert.deepEqual(await service.emailAvailability({ email: " user@X.com " }), { taken: true });
    assert.deepEqual(await service.emailAvailability({}), { taken: false });
    assert.deepEqual(await service.stats(), { families: 3, members: 9 });
  });
});

describe("AvailabilityService", () => {
  test("public mobile check covers every source except rejected applications", async () => {
    const { availability } = build();
    for (const mobile of ["9000000001", "9000000002", "9000000003", "9000000004", "9000000005"])
      assert.equal(await availability.isMobileUsedAnywhere(mobile), true, mobile);
    for (const mobile of ["9000000008", "9000000009", "9999999999", ""]) assert.equal(await availability.isMobileUsedAnywhere(mobile), false, mobile);
  });
  test("application mobile check ignores rejected and the excluded application", async () => {
    const { availability } = build();
    assert.equal(await availability.isMobileTaken("9000000001"), true);
    assert.equal(await availability.isMobileTaken("9000000001", "a1"), false);
    assert.equal(await availability.isMobileTaken("9000000009"), false);
    assert.equal(await availability.isMobileTaken("9000000002"), true);
    assert.equal(await availability.isMobileTaken(null), false);
  });
  test("email check is case-insensitive across all sources", async () => {
    const { availability } = build();
    for (const email of ["APP@x.com", "family@x.com", "member@x.com", "stuapp@x.com", "student@x.com", "user@x.com"])
      assert.equal(await availability.isEmailTaken(email), true, email);
    assert.equal(await availability.isEmailTaken("rejected@x.com"), false);
    assert.equal(await availability.isEmailTaken("app@x.com", "a1"), false);
    assert.equal(await availability.isEmailTaken(""), false);
  });
});
