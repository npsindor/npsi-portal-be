import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { UserRow } from "../../common/session/session.service.js";
import { admin, as, fakeConfig, fakeMail, fakeRecaptcha, fakeSessions, flush, rejectsWith, request, user } from "../../testing/fakes.js";
import type { AvailabilityService } from "../lookups/availability.service.js";
import type { EntitiesRepository } from "./entities.repository.js";
import { EntitiesService } from "./entities.service.js";

const FAM = "NPSI-FAM-000001";
const member = () => user({ id: "u-m", email: "member@example.com" });

type Row = Record<string, unknown>;
const fakeRepo = () => {
  const stored: Row[] = [];
  return {
    stored,
    list: mock.fn(
      async (..._args: unknown[]): Promise<Row[]> => [{ id: "r1", title: "T", created_at: "2026-01-01", updated_at: "2026-01-02", data: '{"a":1}' }],
    ),
    findById: mock.fn(
      async (_table: string, id: string): Promise<Row | undefined> => stored.find((row) => row.id === id) ?? { id, created_at: "c", updated_at: "u" },
    ),
    insert: mock.fn(async (_table: string, columns: string[], values: unknown[]) => {
      stored.push(Object.fromEntries(columns.map((column, i) => [column, values[i]])));
    }),
    update: mock.fn(async (..._args: unknown[]) => undefined),
    delete: mock.fn(async (..._args: unknown[]) => undefined),
    nextSequentialId: mock.fn(async (_table: string, _column: string, prefix: string) => `${prefix}000007`),
    ownFamilyId: mock.fn(async (u: UserRow | null): Promise<string | null> => (u?.id === "u-m" ? FAM : null)),
    familyIdOfFamilyRow: mock.fn(async (id: string) => (id === "f-own" ? { family_id: FAM } : { family_id: "OTHER" })),
    familyIdOfMemberRow: mock.fn(async (id: string) => (id === "m-own" ? { family_id: FAM } : id === "m-other" ? { family_id: "OTHER" } : undefined)),
    familyIdOfMembership: mock.fn(async (id: unknown) => (id === "NPSI-MEM-000001" ? { family_id: FAM } : { family_id: "OTHER" })),
    memberIdsOfFamily: mock.fn(async () => [{ id: "m-own" }]),
    eventFee: mock.fn(async (id: unknown): Promise<{ fee: unknown } | undefined> => (id === "ev" ? { fee: "250.00" } : id === "free" ? { fee: 0 } : undefined)),
    studentForTransfer: mock.fn(async (id: unknown) =>
      id === "STU-OWN" ? { email: "member@example.com", linked_family_id: null } : id === "STU-FAM" ? { email: null, linked_family_id: FAM } : undefined,
    ),
    notificationRecipient: mock.fn(async (id: string) =>
      id === "n-own"
        ? { recipient_family_id: FAM }
        : id === "n-all"
          ? { recipient_family_id: null }
          : id === "n-other"
            ? { recipient_family_id: "OTHER" }
            : undefined,
    ),
  };
};

const fakeAvailability = (mobileTaken = false, emailTaken = false) => ({
  isMobileTaken: mock.fn(async () => mobileTaken),
  isEmailTaken: mock.fn(async () => emailTaken),
});

const build = (current: UserRow | null, { recaptcha = true, mobileTaken = false, emailTaken = false } = {}) => {
  const repo = fakeRepo();
  const mail = fakeMail();
  const availability = fakeAvailability(mobileTaken, emailTaken);
  const service = new EntitiesService(
    as<EntitiesRepository>(repo),
    fakeSessions(current),
    as<AvailabilityService>(availability),
    fakeRecaptcha(recaptcha).service,
    mail.service,
    fakeConfig(),
  );
  return { service, repo, mail, availability };
};
const req = request();

describe("EntitiesService.list", () => {
  test("public entities need no login and map rows to the API shape", async () => {
    const { service, repo } = build(null);
    const rows = await service.list("Event", {}, req);
    assert.deepEqual(rows, [{ id: "r1", title: "T", created_date: "2026-01-01", updated_date: "2026-01-02", data: { a: 1 } }]);
    assert.deepEqual(repo.list.mock.calls[0].arguments, ["events", "", [100], "created_at", true]);
  });
  test("filter, order and limit (clamped to 1..500)", async () => {
    const { service, repo } = build(null);
    await service.list("Event", { filter: '{"status":"ACTIVE","eventId":"x"}', order: "title", limit: "9999" }, req);
    assert.deepEqual(repo.list.mock.calls[0].arguments, ["events", " WHERE `status` = ? AND `event_id` = ?", ["ACTIVE", "x", 500], "title", false]);
    await service.list("Event", { limit: "0" }, req);
    assert.deepEqual((repo.list.mock.calls[1].arguments[2] as unknown[]).at(-1), 1);
  });
  test("invalid filter JSON throws", async () => {
    await assert.rejects(build(null).service.list("Event", { filter: "{bad" }, req), SyntaxError);
  });
  test("admin-only entities", async () => {
    await rejectsWith(build(null).service.list("Family", {}, req), 401, "Authentication required.");
    await rejectsWith(build(member()).service.list("Family", {}, req), 403, "Admin access required.");
    await build(admin()).service.list("Family", {}, req);
  });
  test("notifications: members get their family's and broadcast rows; admins get all", async () => {
    await rejectsWith(build(null).service.list("Notification", {}, req), 401, "Authentication required.");
    const asMember = build(member());
    await asMember.service.list("Notification", { filter: '{"read":0}' }, req);
    assert.deepEqual(asMember.repo.list.mock.calls[0].arguments.slice(1, 3), [
      " WHERE `read` = ? AND (`recipient_family_id` = ? OR `recipient_family_id` IS NULL)",
      [0, FAM, 100],
    ]);
    const noFamily = build(user({ id: "u-x" }));
    await noFamily.service.list("Notification", {}, req);
    assert.deepEqual(noFamily.repo.list.mock.calls[0].arguments.slice(1, 3), [
      " WHERE (`recipient_family_id` = ? OR `recipient_family_id` IS NULL)",
      ["__none__", 100],
    ]);
    const asAdmin = build(admin());
    await asAdmin.service.list("Notification", {}, req);
    assert.equal(asAdmin.repo.list.mock.calls[0].arguments[1], "");
  });
});

describe("EntitiesService.create: access", () => {
  test("admin-only entities", async () => {
    await rejectsWith(build(null).service.create("Announcement", { title: "T" }, req), 401, "Authentication required.");
    await rejectsWith(build(member()).service.create("Announcement", { title: "T" }, req), 403, "Admin access required.");
  });
  test("admins may write markup and choose the id", async () => {
    const { service, repo } = build(admin());
    await service.create("Announcement", { id: "chosen", title: "<b>x</b>", date: "2026-02-01T10:00:00.000Z" }, req);
    // Existing behavior: the date is normalized twice, and the second pass reads
    // "2026-02-01 10:00:00" as server-local time (no shift on a UTC server).
    const stored = new Date("2026-02-01 10:00:00").toISOString().slice(0, 19).replace("T", " ");
    assert.deepEqual(repo.insert.mock.calls[0].arguments, ["announcements", ["id", "title", "date"], ["chosen", "<b>x</b>", stored]]);
  });
  test("families: members can never create them", async () => {
    await rejectsWith(build(member()).service.create("Family", {}, req), 403, "Admin access required.");
    const { service, repo } = build(admin());
    const created = await service.create("Family", { family_id: "CLIENT", family_name: "F" }, req);
    assert.equal(repo.stored[0].family_id, "NPSI-FAM-000007");
    assert.ok(created.id);
  });
  test("family members: only into the member's own family, with the field whitelist", async () => {
    await rejectsWith(build(null).service.create("FamilyMember", { family_id: FAM }, req), 401, "Authentication required.");
    await rejectsWith(build(member()).service.create("FamilyMember", { family_id: "OTHER" }, req), 403, "You can only add members to your own family.");
    await rejectsWith(build(user({ id: "u-x" })).service.create("FamilyMember", { family_id: FAM }, req), 403, "You can only add members to your own family.");
    const { service, repo } = build(member());
    await service.create("FamilyMember", { family_id: FAM, name: "Kid", photo_url: "x", membership_id: "CLIENT", id: "chosen" }, req);
    const row = repo.stored[0];
    assert.notEqual(row.id, "chosen");
    assert.deepEqual(
      { family_id: row.family_id, name: row.name, membership_id: row.membership_id, photo_url: row.photo_url },
      { family_id: FAM, name: "Kid", membership_id: "NPSI-MEM-000007", photo_url: undefined },
    );
  });
  test("auth-create entities need a login; markup is rejected for members", async () => {
    await rejectsWith(build(null).service.create("Feedback", { message: "hi" }, req), 401, "Authentication required.");
    await rejectsWith(build(member()).service.create("Feedback", { message: "<x>" }, req), 400, 'The "message" field cannot contain < or > characters.');
    const { service, repo } = build(member());
    await service.create("Feedback", { message: "hi", internal_note: "dropped" }, req);
    assert.equal(repo.stored[0].feedback_id, "FB-000007");
    assert.equal(repo.stored[0].internal_note, undefined);
  });
  test("public-create entities skip the whitelist but not the markup check", async () => {
    const { service, repo } = build(null);
    await service.create("Transaction", { id: "chosen", transaction_id: "T1", amount: 5 }, req);
    assert.equal(repo.stored[0].id, "chosen");
    await rejectsWith(service.create("Notification", { title: "<x>" }, req), 400, 'The "title" field cannot contain < or > characters.');
  });
});

describe("EntitiesService.create: event registrations", () => {
  const body = (overrides = {}) => ({
    registration_id: "R1",
    event_id: "ev",
    family_id: FAM,
    member_ids: ["m-own"],
    total_fee: 0,
    payment_status: "SUCCESS",
    ...overrides,
  });

  test("must be the member's own family and members, for an existing event", async () => {
    await rejectsWith(
      build(member()).service.create("EventRegistration", body({ family_id: "OTHER" }), req),
      403,
      "You can only register your own family for events.",
    );
    await rejectsWith(
      build(member()).service.create("EventRegistration", body({ member_ids: ["m-other"] }), req),
      403,
      "You can only register members of your own family.",
    );
    await rejectsWith(build(member()).service.create("EventRegistration", body({ event_id: "missing" }), req), 404, "Event not found.");
  });
  test("fees are computed server-side", async () => {
    const paid = build(member());
    await paid.service.create("EventRegistration", body(), req);
    const row = paid.repo.stored[0];
    assert.deepEqual([row.fee_per_member, row.total_fee, row.payment_status, row.registered_by_id], [250, 250, "PENDING", "u-m"]);
    const free = build(member());
    await free.service.create("EventRegistration", body({ event_id: "free", member_ids: undefined }), req);
    assert.deepEqual([free.repo.stored[0].total_fee, free.repo.stored[0].payment_status], [0, "SUCCESS"]);
  });
  test("admins are not restricted", async () => {
    const { service, repo } = build(admin());
    await service.create("EventRegistration", body({ family_id: "OTHER", total_fee: 0 }), req);
    assert.equal(repo.stored[0].total_fee, 0);
  });
});

describe("EntitiesService.create: transfer requests", () => {
  test("only for the member's own family, member or student record", async () => {
    const svc = build(member()).service;
    await rejectsWith(
      svc.create("TransferRequest", { request_type: "M", source_family_id: "OTHER" }, req),
      403,
      "You can only request a transfer for your own family.",
    );
    await rejectsWith(
      svc.create("TransferRequest", { request_type: "M", source_membership_id: "NPSI-MEM-999" }, req),
      403,
      "You can only request a transfer for a member of your own family.",
    );
    await rejectsWith(
      svc.create("TransferRequest", { request_type: "S", source_student_id: "STU-NONE" }, req),
      403,
      "You can only request a transfer for your own student record.",
    );
  });
  test("forces PENDING and the requester", async () => {
    for (const source of [{ source_membership_id: "NPSI-MEM-000001" }, { source_student_id: "STU-OWN" }, { source_student_id: "STU-FAM" }]) {
      const { service, repo } = build(member());
      await service.create("TransferRequest", { request_type: "M", status: "APPROVED", ...source }, req);
      assert.deepEqual([repo.stored[0].status, repo.stored[0].requester_id, repo.stored[0].request_id], ["PENDING", "u-m", "TRF-000007"]);
    }
  });
});

describe("EntitiesService.create: application forms", () => {
  const application = (overrides = {}) => ({
    family_head_name: "Head",
    mobile: "9876500001",
    family_name: "Fam",
    email: "a@example.com",
    address: "A",
    city: "C",
    district: "D",
    recaptchaToken: "t",
    ...overrides,
  });
  const student = (overrides = {}) => ({
    student_name: "S",
    mobile: "9876500002",
    email: "s@example.com",
    gender: "M",
    father_name: "F",
    academic_year: "2026",
    ...overrides,
  });

  test("reCAPTCHA failure", async () => {
    await rejectsWith(
      build(null, { recaptcha: false }).service.create("Application", application(), req),
      400,
      "reCAPTCHA verification failed. Please try again.",
    );
  });
  test("application validation messages, in order", async () => {
    const svc = build(null).service;
    const cases: [Row, string][] = [
      [{ mobile: "12" }, "A valid 10-digit mobile number is required."],
      [{ family_name: " " }, "Family name is required."],
      [{ email: "nope" }, "A valid email address is required."],
      [{ address: "" }, "Address is required."],
      [{ city: "" }, "City is required."],
      [{ district: "" }, "District is required."],
    ];
    for (const [override, message] of cases) await rejectsWith(svc.create("Application", application(override), req), 400, message);
    await rejectsWith(
      build(null, { mobileTaken: true }).service.create("Application", application(), req),
      409,
      "This mobile number is already registered on the portal.",
    );
    await rejectsWith(
      build(null, { emailTaken: true }).service.create("Application", application(), req),
      409,
      "This email is already registered on the portal.",
    );
  });
  test("application: stored without the token, sequential id, welcome + admin emails", async () => {
    const { service, repo, mail } = build(null);
    await service.create("Application", application({ members_data: [{ name: "X" }] }), req);
    const row = repo.stored[0];
    assert.equal(row.recaptchaToken, undefined);
    assert.equal(row.application_id, `NPSI-APP-${new Date().getFullYear()}-000007`);
    assert.equal(row.members_data, '[{"name":"X"}]');
    await flush();
    await flush();
    assert.equal(mail.send.mock.callCount(), 2);
  });
  test("application without email: only the admin email; failures are logged", async () => {
    const { service, repo, mail } = build(null);
    repo.findById.mock.mockImplementation(async (_t: string, id: string) => ({ id, family_head_name: null, email: null }));
    mail.send.mock.mockImplementation(async () => {
      throw new Error("smtp");
    });
    const error = mock.method(console, "error", () => undefined);
    await service.create("Application", application(), req);
    await flush();
    await flush();
    assert.equal(mail.send.mock.callCount(), 1);
    assert.match(String(error.mock.calls[0]?.arguments[0]), /application email failed/);
    error.mock.restore();
  });
  test("student application validation messages, in order", async () => {
    const svc = build(null).service;
    const cases: [Row, string][] = [
      [{ student_name: "" }, "Student name is required."],
      [{ mobile: "1" }, "A valid 10-digit mobile number is required."],
      [{ guardian_mobile: "12" }, "Guardian mobile number must be a valid 10-digit number."],
      [{ email: "x" }, "A valid email address is required."],
      [{ gender: "" }, "Gender is required."],
      [{ father_name: "" }, "Father's name is required."],
      [{ academic_year: "" }, "Academic year is required."],
    ];
    for (const [override, message] of cases) await rejectsWith(svc.create("StudentApplication", student(override), req), 400, message);
    await rejectsWith(
      build(null, { mobileTaken: true }).service.create("StudentApplication", student(), req),
      409,
      "This mobile number is already registered on the portal.",
    );
    await rejectsWith(
      build(null, { emailTaken: true }).service.create("StudentApplication", student(), req),
      409,
      "This email is already registered on the portal.",
    );
    const ok = build(null);
    await ok.service.create("StudentApplication", student({ guardian_mobile: "9876500003" }), req);
    assert.equal(ok.repo.stored[0].application_id, `NPSI-STU-APP-${new Date().getFullYear()}-000007`);
  });
});

describe("EntitiesService.createBatch", () => {
  test("admin only", async () => {
    await rejectsWith(build(null).service.createBatch("Family", { records: [{}] }, req), 401, "Authentication required.");
    await rejectsWith(build(member()).service.createBatch("Family", { records: [{}] }, req), 403, "Admin access required.");
  });
  test("nothing to create is a 200 with []", async () => {
    const { service } = build(admin());
    assert.deepEqual(await service.createBatch("Family", { records: [] }, req), { status: 200, records: [] });
    assert.deepEqual(await service.createBatch("Family", { records: "nope" }, req), { status: 200, records: [] });
    assert.deepEqual(await service.createBatch("Family", undefined, req), { status: 200, records: [] });
  });
  test("consecutive ids, whitelisted fields, empty dates become null", async () => {
    const { service, repo } = build(admin());
    const result = await service.createBatch("Family", { records: [{ family_name: "A", bogus: 1 }, { family_name: "B", registration_date: "" }, null] }, req);
    assert.equal(result.status, 201);
    assert.deepEqual(
      repo.stored.map((r) => r.family_id),
      ["NPSI-FAM-000007", "NPSI-FAM-000008", "NPSI-FAM-000009"],
    );
    assert.equal(repo.stored[0].bogus, undefined);
    assert.equal(repo.stored[1].registration_date, null);
  });
  test("entities without sequential ids", async () => {
    const { service, repo } = build(admin());
    await service.createBatch("Event", { records: [{ title: "E" }] }, req);
    assert.deepEqual(Object.keys(repo.stored[0]), ["id", "title"]);
  });
});

describe("EntitiesService.update", () => {
  test("admin-only entities, and 404 when the record is gone", async () => {
    await rejectsWith(build(member()).service.update("Event", "e1", { title: "x" }, req), 403, "Admin access required.");
    const { service, repo } = build(admin());
    const updated = await service.update("Event", "e1", { title: "x", created_date: "ignored" }, req);
    assert.deepEqual(repo.update.mock.calls[0].arguments, ["events", ["title"], ["x"], "e1"]);
    assert.equal(updated.id, "e1");
    repo.findById.mock.mockImplementation(async () => undefined);
    await rejectsWith(service.update("Event", "gone", { title: "x" }, req), 404, "Record not found");
  });
  test("no-op updates skip the UPDATE", async () => {
    const { service, repo } = build(admin());
    await service.update("Event", "e1", {}, req);
    await service.update("Event", "e1", undefined, req);
    assert.equal(repo.update.mock.callCount(), 0);
  });
  test("ownership for families and members", async () => {
    await rejectsWith(build(null).service.update("Family", "f-own", {}, req), 401, "Authentication required.");
    await rejectsWith(build(user({ id: "u-x" })).service.update("Family", "f-own", {}, req), 403, "No family found for your account.");
    await rejectsWith(build(member()).service.update("Family", "f-other", {}, req), 403, "You can only update your own family.");
    await rejectsWith(build(member()).service.update("FamilyMember", "m-other", {}, req), 403, "You can only update members of your own family.");
    await rejectsWith(build(member()).service.update("FamilyMember", "m-missing", {}, req), 403, "You can only update members of your own family.");
    await rejectsWith(build(member()).service.update("FamilyMember", "m-own", { name: "<x>" }, req), 400, 'The "name" field cannot contain < or > characters.');
    const { service, repo } = build(member());
    await service.update("FamilyMember", "m-own", { name: "N", membership_id: "HACK" }, req);
    assert.deepEqual(repo.update.mock.calls[0].arguments.slice(1, 3), [["name"], ["N"]]);
    await service.update("Family", "f-own", { member_count: 3, status: "ACTIVE" }, req);
    assert.deepEqual(repo.update.mock.calls[1].arguments.slice(1, 3), [["member_count"], [3]]);
  });
  test("notifications: members may only touch their own (or broadcast) ones", async () => {
    await rejectsWith(build(member()).service.update("Notification", "n-other", { read: true }, req), 403, "You can only update your own notifications.");
    await rejectsWith(build(member()).service.update("Notification", "n-missing", { read: true }, req), 403, "You can only update your own notifications.");
    for (const id of ["n-own", "n-all"]) {
      const { service, repo } = build(member());
      await service.update("Notification", id, { read: true, title: "ignored" }, req);
      assert.deepEqual(repo.update.mock.calls[0].arguments.slice(1, 3), [["read"], [true]]);
    }
    const { service, repo } = build(admin());
    await service.update("Notification", "n-other", { title: "T" }, req);
    assert.deepEqual(repo.update.mock.calls[0].arguments.slice(1, 3), [["title"], ["T"]]);
  });
});

describe("EntitiesService.remove", () => {
  test("family members: admins, or members of the same family", async () => {
    await rejectsWith(build(null).service.remove("FamilyMember", "m-own", req), 401, "Authentication required.");
    await rejectsWith(build(member()).service.remove("FamilyMember", "m-other", req), 403, "You can only remove members of your own family.");
    await rejectsWith(build(user({ id: "u-x" })).service.remove("FamilyMember", "m-own", req), 403, "You can only remove members of your own family.");
    const own = build(member());
    await own.service.remove("FamilyMember", "m-own", req);
    assert.deepEqual(own.repo.delete.mock.calls[0].arguments, ["family_members", "m-own"]);
    const asAdmin = build(admin());
    await asAdmin.service.remove("FamilyMember", "m-other", req);
    assert.equal(asAdmin.repo.delete.mock.callCount(), 1);
  });
  test("everything else is admin only", async () => {
    await rejectsWith(build(member()).service.remove("Event", "e1", req), 403, "Admin access required.");
    const { service, repo } = build(admin());
    await service.remove("Event", "e1", req);
    assert.deepEqual(repo.delete.mock.calls[0].arguments, ["events", "e1"]);
  });
});
