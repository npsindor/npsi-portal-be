import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { Family, Student } from "../generated/prisma/client.js";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { fakeMembership } from "../testing/fake-repo.js";
import { as, user } from "../testing/fakes.js";
import { eventRegistrationRow, familyMemberRow, familyRow, feedbackRow, studentRow } from "../testing/rows.js";
import type { MeRepository } from "./me.repository.js";
import { MeService } from "./me.service.js";

const fakeRepo = (activeFamily = true) => ({
  activeFamilyByEmail: mock.fn(async (): Promise<Family | null> => (activeFamily ? familyRow({ id: "f1", familyId: "FAM-1" }) : null)),
  memberFamilyIdByEmail: mock.fn(async (): Promise<string | null> => "FAM-2"),
  familyByFamilyId: mock.fn(async (familyId: string) => familyRow({ id: "f2", familyId })),
  membersOfFamily: mock.fn(async (_familyId: string) => [familyMemberRow({ id: "m1", dob: new Date("2000-05-06T00:00:00Z") })]),
  studentByEmail: mock.fn(async (): Promise<Student | null> => studentRow({ id: "s1" })),
  feedbackByEmail: mock.fn(async () => [feedbackRow({ id: "fb1", questions: ["q"] })]),
  eventRegistrationsOfFamily: mock.fn(async (_familyId: string) => [eventRegistrationRow({ id: "r1", status: "CANCELLED" })]),
});
const meService = (repo: ReturnType<typeof fakeRepo>) => new MeService(as<MeRepository>(repo), as<MembershipRepository>(fakeMembership()));

describe("MeService.family", () => {
  test("uses the member's ACTIVE family and maps every record to the camelCase API shape", async () => {
    const repo = fakeRepo();
    const result = await meService(repo).family(user());
    assert.deepEqual([result.family?.id, result.family?.familyId], ["f1", "FAM-1"]);
    assert.deepEqual([result.members[0].id, result.members[0].dob], ["m1", "2000-05-06"]);
    assert.equal(result.student?.id, "s1");
    assert.equal(repo.membersOfFamily.mock.calls[0].arguments[0], "FAM-1");
  });
  test("falls back to the family the member is listed in", async () => {
    const result = await meService(fakeRepo(false)).family(user());
    assert.equal(result.family?.familyId, "FAM-2");
  });
  test("nothing found: nulls and empty members", async () => {
    const repo = fakeRepo(false);
    repo.memberFamilyIdByEmail.mock.mockImplementation(async () => null);
    repo.studentByEmail.mock.mockImplementation(async () => null);
    assert.deepEqual(await meService(repo).family(user()), { family: null, members: [], student: null });
  });
  test("users without an email get nothing", async () => {
    const repo = fakeRepo();
    assert.deepEqual(await meService(repo).family(user({ email: null })), { family: null, members: [], student: null });
    assert.equal(repo.activeFamilyByEmail.mock.callCount(), 0);
  });
});

describe("MeService.feedback", () => {
  test("own feedback, mapped", async () => {
    const service = meService(fakeRepo());
    const [feedback] = await service.feedback(user());
    assert.deepEqual([feedback.id, feedback.questions, feedback.archived], ["fb1", ["q"], false]);
    assert.deepEqual(await service.feedback(user({ email: null })), []);
  });
});

describe("MeService.eventRegistrations", () => {
  test("the member's family's registrations, cancelled ones included; nothing without a family", async () => {
    const repo = fakeRepo();
    const [registration] = await meService(repo).eventRegistrations(user({ id: "u-m" }));
    assert.deepEqual([registration.id, registration.status], ["r1", "CANCELLED"]);
    assert.equal(repo.eventRegistrationsOfFamily.mock.calls[0].arguments[0], "NPSI-FAM-000001");
    assert.deepEqual(await meService(repo).eventRegistrations(user()), []);
  });
});
