import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, rejectsWith, user } from "../testing/fakes.js";
import { feedbackRow } from "../testing/rows.js";
import type { FeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";

const build = () => {
  const repo = fakeModelRepo(feedbackRow);
  repo.latestDisplayIds.mock.mockImplementation(async () => ["FB-000004", "FB-LEGACY"]);
  return { service: new FeedbackService(as<FeedbackRepository>(repo)), repo };
};

describe("FeedbackService", () => {
  test("members: next id, only the form's fields (replies and notes are admin-only), no markup", async () => {
    const { service } = build();
    const created = await service.create(
      { memberName: "M", message: "Hi", rating: 5, questions: ["a"], reply: "x", internalNote: "y", archived: true },
      user(),
    );
    assert.deepEqual(
      [created.feedbackId, created.message, created.rating, created.questions, created.reply, created.internalNote, created.archived],
      ["FB-000005", "Hi", 5, ["a"], null, null, false],
    );
    await rejectsWith(service.create({ memberName: "M", message: "<b>" }, user()), 400, 'The "message" field cannot contain < or > characters.');
  });
  test("admins: everything; list, update, remove", async () => {
    const { service } = build();
    const created = await service.create({ memberName: "M", internalNote: "note" }, admin());
    assert.equal(created.internalNote, "note");
    assert.equal((await service.update(created.id, { archived: true })).archived, true);
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    assert.equal((await service.list({ order: "-submittedDate", limit: 200 })).length, 1);
    await service.remove(created.id);
  });
});
