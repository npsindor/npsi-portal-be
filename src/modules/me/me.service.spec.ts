import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { as, user } from "../../testing/fakes.js";
import type { MeRepository } from "./me.repository.js";
import { MeService } from "./me.service.js";

const row = (id: string, extra = {}) => ({ id, created_at: "c", updated_at: "u", ...extra });

const fakeRepo = (activeFamily = true) => ({
  activeFamilyByEmail: mock.fn(async () => (activeFamily ? row("f1", { family_id: "FAM-1" }) : undefined)),
  memberFamilyIdByEmail: mock.fn(async (): Promise<{ family_id: string } | undefined> => ({ family_id: "FAM-2" })),
  familyByFamilyId: mock.fn(async (id: string) => row("f2", { family_id: id })),
  membersOfFamily: mock.fn(async (_familyId: unknown) => [row("m1")]),
  studentByEmail: mock.fn(async (): Promise<Record<string, unknown> | undefined> => row("s1")),
  feedbackByEmail: mock.fn(async () => [row("fb1", { questions: '["q"]' })]),
});

describe("MeService.family", () => {
  test("uses the member's ACTIVE family and maps every record", async () => {
    const repo = fakeRepo();
    const result = await new MeService(as<MeRepository>(repo)).family(user());
    assert.deepEqual(result, {
      family: { id: "f1", family_id: "FAM-1", created_date: "c", updated_date: "u" },
      members: [{ id: "m1", created_date: "c", updated_date: "u" }],
      student: { id: "s1", created_date: "c", updated_date: "u" },
    });
    assert.equal(repo.membersOfFamily.mock.calls[0].arguments[0], "FAM-1");
  });
  test("falls back to the family the member is listed in", async () => {
    const repo = fakeRepo(false);
    const result = await new MeService(as<MeRepository>(repo)).family(user());
    assert.equal(result.family?.family_id, "FAM-2");
  });
  test("nothing found: nulls and empty members", async () => {
    const repo = fakeRepo(false);
    repo.memberFamilyIdByEmail.mock.mockImplementation(async () => undefined);
    repo.studentByEmail.mock.mockImplementation(async () => undefined);
    assert.deepEqual(await new MeService(as<MeRepository>(repo)).family(user()), { family: null, members: [], student: null });
  });
  test("users without an email get nothing", async () => {
    const repo = fakeRepo();
    assert.deepEqual(await new MeService(as<MeRepository>(repo)).family(user({ email: null })), { family: null, members: [], student: null });
    assert.equal(repo.activeFamilyByEmail.mock.callCount(), 0);
  });
});

describe("MeService.feedback", () => {
  test("own feedback, mapped", async () => {
    const service = new MeService(as<MeRepository>(fakeRepo()));
    assert.deepEqual(await service.feedback(user()), [{ id: "fb1", questions: ["q"], created_date: "c", updated_date: "u" }]);
    assert.deepEqual(await service.feedback(user({ email: null })), []);
  });
});
