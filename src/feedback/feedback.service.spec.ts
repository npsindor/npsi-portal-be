import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MembershipRepository } from "../membership/membership.repository.js";
import { fakeMembership, fakeModelRepo } from "../testing/fake-repo.js";
import { admin, as, fakeRecaptcha, rejectsWith, user } from "../testing/fakes.js";
import { feedbackRow } from "../testing/rows.js";
import type { FeedbackRepository } from "./feedback.repository.js";
import { FeedbackService } from "./feedback.service.js";

const build = (recaptchaPasses = true) => {
  const repo = fakeModelRepo(feedbackRow);
  repo.latestDisplayIds.mock.mockImplementation(async () => ["FB-000004", "FB-LEGACY"]);
  return {
    service: new FeedbackService(as<FeedbackRepository>(repo), fakeRecaptcha(recaptchaPasses).service, as<MembershipRepository>(fakeMembership())),
    repo,
  };
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
  test("members: identity and workflow fields come from the session and the server", async () => {
    const { service } = build();
    const created = await service.create(
      { memberName: "Someone", email: "victim@example.com", familyId: "NPSI-FAM-000001", status: "Resolved", submittedDate: "2020-01-01T00:00:00.000Z" },
      user({ id: "u-m" }),
    );
    assert.deepEqual([created.memberName, created.email, created.familyId, created.status], ["Member", "member@example.com", "NPSI-FAM-000001", "Submitted"]);
    assert.notEqual(created.submittedDate, "2020-01-01T00:00:00.000Z");
    const outsider = await service.create({ memberName: "M", familyId: "NPSI-FAM-000001" }, user());
    assert.equal(outsider.familyId, null);
  });
  test("members: attachments must be portal uploads, survey answers are bounded", async () => {
    const { service } = build();
    for (const attachmentUrl of ["javascript:alert(document.domain)", "https://evil.example/x.png"])
      await rejectsWith(service.create({ memberName: "M", attachmentUrl }, user()), 400, "The attachment must be an image uploaded to the portal.");
    const upload = "https://api.npsindore.org/uploads/8a36a244-c5f8-4068-91ea-127a7857679f.jpg";
    assert.equal((await service.create({ memberName: "M", attachmentUrl: upload }, user())).attachmentUrl, upload);
    await rejectsWith(service.create({ memberName: "M", questions: { a: "x".repeat(20_000) } }, user()), 400, "The survey answers are too long.");
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

  test("public Contact / Feedback messages: reCAPTCHA, a reply channel for enquiries, no markup, saved as Submitted", async () => {
    const message = {
      kind: "CONTACT" as const,
      name: "Ravi",
      category: "Membership",
      message: "How do I register my family?",
      consent: true as const,
      recaptchaToken: "t",
    };
    await rejectsWith(build(false).service.createPublic({ ...message, email: "ravi@example.com" }), 400, /reCAPTCHA/);
    await rejectsWith(build().service.createPublic(message), 400, "Give an email or mobile number so we can reply.");
    await rejectsWith(build().service.createPublic({ ...message, email: "ravi@example.com", message: "<script>x</script>" }), 400, /.+/);
    const { service, repo } = build();
    const saved = await service.createPublic({ ...message, mobile: "+91 98765-43210" });
    assert.equal(saved.reference, "FB-000005");
    const data = repo.create.mock.calls[0].arguments[0] as Record<string, unknown>;
    assert.equal(data.status, "Submitted");
    assert.equal(data.feedbackType, "Contact enquiry · Membership");
    assert.match(String(data.message), /Mobile: 9876543210$/);
    assert.deepEqual(data.questions, { source: "PUBLIC_WEBSITE", kind: "CONTACT", category: "Membership", mobile: "9876543210", lang: "en" });
    // Feedback (not an enquiry) needs no contact details.
    await build().service.createPublic({ ...message, kind: "FEEDBACK" });
  });
});
