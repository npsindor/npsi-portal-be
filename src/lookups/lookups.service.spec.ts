import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { as, rejectsWith } from "../testing/fakes.js";
import { applicationRow } from "../testing/rows.js";
import { AvailabilityService } from "./availability.service.js";
import type { LookupsRepository } from "./lookups.repository.js";
import { LookupsService } from "./lookups.service.js";

const fakeRepo = () => ({
  publicFamily: mock.fn(async (id: string) =>
    id === "NPSI-FAM-000001" ? { familyId: id, familyName: "F", headName: "H", status: "ACTIVE", city: "Indore", registrationDate: null } : null,
  ),
  publicMembers: mock.fn(async () => [{ name: "M", relationship: "Self", gender: "Male", status: "ACTIVE" }]),
  application: mock.fn(async (id: string, mobile: string) =>
    id === "APP-1" && mobile === "9876543210" ? applicationRow({ id: "a1", applicationId: id, membersData: [{ n: 1 }] }) : null,
  ),
  activeCounts: mock.fn(async () => ({ families: 3, members: 9 })),
  // Matching rules run in SQL (covered by the contract tests); here: which value is asked for.
  mobileUsedAnywhere: mock.fn(async (target: string) => target === "9000000002"),
  mobileTaken: mock.fn(async (target: string, exclude?: string) => target === "9000000001" && exclude !== "a1"),
  emailTaken: mock.fn(async (target: string, exclude?: string) => target === "user@x.com" && exclude !== "a1"),
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
    assert.equal(result.family.familyId, "NPSI-FAM-000001");
    assert.equal(result.members.length, 1);
    await rejectsWith(service.verifyFamily("NPSI-FAM-999999"), 404, "No family found for this ID.");
  });
  test("applicationStatus validates input and maps the record", async () => {
    const { service } = build();
    await rejectsWith(service.applicationStatus({ applicationId: "APP-1" }), 400, "Application ID and mobile number are required.");
    await rejectsWith(service.applicationStatus({ mobile: " " }), 400, "Application ID and mobile number are required.");
    await rejectsWith(service.applicationStatus({ applicationId: "APP-1", mobile: "1" }), 404, "No application found for this ID and mobile number.");
    const found = await service.applicationStatus({ applicationId: " APP-1 ", mobile: " 9876543210 " });
    assert.deepEqual([found.id, found.applicationId, found.membersData], ["a1", "APP-1", [{ n: 1 }]]);
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
  test("mobile checks compare the last 10 digits and skip empty input", async () => {
    const { availability, repo } = build();
    assert.equal(await availability.isMobileUsedAnywhere("+91 90000-00002"), true);
    assert.equal(repo.mobileUsedAnywhere.mock.calls[0].arguments[0], "9000000002");
    assert.equal(await availability.isMobileUsedAnywhere("abc"), false);
    assert.equal(await availability.isMobileUsedAnywhere(null), false);
    assert.equal(repo.mobileUsedAnywhere.mock.callCount(), 1, "no query for empty input");
  });
  test("application mobile check passes the excluded application", async () => {
    const { availability, repo } = build();
    assert.equal(await availability.isMobileTaken("9000000001"), true);
    assert.equal(await availability.isMobileTaken("9000000001", "a1"), false);
    assert.deepEqual(repo.mobileTaken.mock.calls[1].arguments, ["9000000001", "a1"]);
    assert.equal(await availability.isMobileTaken(""), false);
  });
  test("email check is trimmed and lower-cased", async () => {
    const { availability, repo } = build();
    assert.equal(await availability.isEmailTaken("  USER@x.com "), true);
    assert.equal(repo.emailTaken.mock.calls[0].arguments[0], "user@x.com");
    assert.equal(await availability.isEmailTaken("user@x.com", "a1"), false);
    assert.equal(await availability.isEmailTaken(""), false);
    assert.equal(await availability.isEmailTaken(undefined), false);
  });
});
