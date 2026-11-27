import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { EventMemberApplication } from "../generated/prisma/client.js";
import { admin, as, fakeRecaptcha, rejectsWith, user } from "../testing/fakes.js";
import type { EventMemberApplyDto } from "./event-members.dto.js";
import { activeKeyOf, EventMembersService, nameKey, sameEntry, toPublicCard, villageKey } from "./event-members.service.js";

const SECTION = {
  id: "ems-holi",
  key: "HOLI",
  label: "Holi Milan",
  labelHi: null,
  heading: "Holi Milan Team",
  headingHi: null,
  eventId: null,
  isCoreTeam: false,
};
const appRow = (o: Partial<EventMemberApplication> = {}) =>
  ({
    id: "a-1",
    sectionId: "ems-holi",
    customEventName: null,
    userId: null,
    familyId: null,
    memberId: null,
    studentId: null,
    photoUrl: null,
    name: "Asha",
    designation: null,
    designationHi: null,
    mobile: "9876543210",
    mobileDigits: "9876543210",
    mobilePublic: false,
    email: "asha@example.com",
    emailPublic: false,
    village: "Kasrawad",
    area: "Palasia",
    showOnWebsite: true,
    status: "PENDING",
    rejectionReason: null,
    activeKey: "ems-holi|P:9876543210",
    rosterId: null,
    source: "PUBLIC",
    sortOrder: 0,
    approvedById: null,
    approvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  }) as EventMemberApplication;

const build = ({
  recaptcha = true,
  open = null as { id: string } | null,
  row = appRow(),
  listed = [] as { id?: string; name: string; village: string | null }[],
} = {}) => {
  const created: unknown[] = [];
  const updates: unknown[] = [];
  const db = {
    eventMemberSection: {
      findFirst: mock.fn(async (args: { where: { key: string } }) => (args.where.key === "HOLI" ? SECTION : null)),
      findUnique: mock.fn(async () => SECTION),
    },
    eventMemberApplication: {
      findFirst: mock.fn(async (args: { where: { id?: string; status?: unknown } }) => (args.where.id ? { ...row, section: SECTION } : open)),
      findUnique: mock.fn(async () => row),
      findMany: mock.fn(async () => listed),
      aggregate: mock.fn(async () => ({ _max: { sortOrder: 7 } })),
      create: mock.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { ...appRow(), ...args.data };
      }),
      update: mock.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return { ...row, ...args.data };
      }),
      updateMany: mock.fn(async () => ({ count: 0 })),
      delete: mock.fn(async (_args: { where: { id: string } }) => row),
    },
    eventMemberApplicationLog: { create: mock.fn(async () => ({})) },
    eventRoster: { updateMany: mock.fn(async () => ({ count: 1 })) },
    $transaction: mock.fn(async <T>(work: (tx: unknown) => Promise<T>) => work(db)),
  };
  const service = new EventMembersService(as<PrismaService>(db), fakeRecaptcha(recaptcha).service);
  return { service, db, created, updates };
};
const form = (o: Partial<EventMemberApplyDto> = {}): EventMemberApplyDto => ({
  sectionKey: "HOLI",
  name: "Asha Patidar",
  mobile: "+91 98765 43210",
  email: "Asha@Example.com",
  village: "Kasrawad",
  area: "Palasia",
  mobilePublic: false,
  emailPublic: false,
  consent: true,
  ...o,
});

describe("EventMembersService", () => {
  test("arrange order: the given order becomes 1, 2, 3…; members left out keep their place after them; strangers refused", async () => {
    const team = [
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
      { id: "c", sortOrder: 3 },
      { id: "d", sortOrder: 4 },
    ];
    const updates: { id: string; sortOrder: number }[] = [];
    const db = {
      eventMemberSection: { findUnique: mock.fn(async (args: { where: { id: string } }) => (args.where.id === "ems-core" ? { id: "ems-core" } : null)) },
      eventMemberApplication: {
        findMany: mock.fn(async () => team),
        update: mock.fn(async (args: { where: { id: string }; data: { sortOrder: number } }) =>
          updates.push({ id: args.where.id, sortOrder: args.data.sortOrder }),
        ),
      },
      eventMemberApplicationLog: { create: mock.fn(async () => ({})) },
      $transaction: mock.fn(async <T>(work: (tx: unknown) => Promise<T>) => work(db)),
    };
    const service = new EventMembersService(as<PrismaService>(db), fakeRecaptcha(true).service);
    // "Move d to number 2"
    assert.deepEqual((await service.reorderSection("ems-core", ["a", "d", "b"], admin())).ids, ["a", "d", "b", "c"]);
    assert.deepEqual(
      updates,
      [
        { id: "d", sortOrder: 2 },
        { id: "b", sortOrder: 3 },
        { id: "c", sortOrder: 4 },
      ],
      "only the rows whose number changed are written",
    );
    await rejectsWith(service.reorderSection("ems-core", ["a", "zz"], admin()), 400, "EM_ORDER");
    await rejectsWith(service.reorderSection("nope", [], admin()), 404, "EM_SECTION");
    await rejectsWith(service.reorderSection("ems-core", ["a"], user()), 403, /.*/);
  });
  test("public card: no record ids, mobile and email only with consent", () => {
    const card = toPublicCard(appRow({ memberId: "m-1", studentId: "NPSI-STU-1", familyId: "NPSI-FAM-1" }));
    assert.equal(card.mobile, null);
    assert.equal(card.email, null);
    assert.ok(!JSON.stringify(card).includes("NPSI-"));
    assert.equal(toPublicCard(appRow({ mobilePublic: true, emailPublic: true })).mobile, "9876543210");
  });
  test("public card carries the Hindi name and village for the Hindi site", () => {
    const card = toPublicCard(appRow({ nameHi: "आशा", villageHi: "कसरावद" } as Partial<EventMemberApplication>));
    assert.deepEqual([card.name, card.nameHi, card.village, card.villageHi], ["Asha", "आशा", "Kasrawad", "कसरावद"]);
  });
  test("active key: one open application per person per section", () => {
    assert.equal(activeKeyOf("s", null, { memberId: "m", studentId: "S", mobileDigits: "9" }, "x"), "s|M:m");
    assert.equal(activeKeyOf(null, "Ganesh Utsav", { memberId: null, studentId: null, mobileDigits: "9876543210" }, "x"), "OTHER:ganesh utsav|P:9876543210");
  });
  test("public submission needs reCAPTCHA and is saved PENDING, unlinked, with the typed details", async () => {
    await rejectsWith(build({ recaptcha: false }).service.apply(form(), null), 400, "reCAPTCHA verification failed. Please try again.");
    const { service, created } = build();
    const result = await service.apply(form(), null);
    const data = created[0] as Record<string, unknown>;
    assert.deepEqual(result, { id: data.id, status: "PENDING" });
    assert.equal(data.mobileDigits, "9876543210");
    assert.equal(data.email, "asha@example.com");
    assert.equal(data.userId, null);
    assert.equal(data.memberId, null);
    assert.equal(data.source, "PUBLIC");
    assert.equal(data.activeKey, "ems-holi|P:9876543210");
  });
  test("OTHER needs an event name; unknown sections and duplicates are refused", async () => {
    await rejectsWith(build().service.apply(form({ sectionKey: "OTHER" }), null), 400, "EM_OTHER_NAME");
    await rejectsWith(build().service.apply(form({ sectionKey: "NOPE" }), null), 400, "EM_SECTION");
    await rejectsWith(build({ open: { id: "other" } }).service.apply(form(), null), 409, "EM_DUPLICATE");
    await rejectsWith(build().service.apply(form({ photoUrl: "https://evil.example.com/a.jpg" }), null), 400, "EM_PHOTO");
  });
  test("without a linked record every detail is required", async () => {
    await rejectsWith(build().service.apply(form({ name: undefined }), null), 400, "EM_NAME");
    await rejectsWith(build().service.apply(form({ mobile: undefined }), null), 400, "EM_MOBILE");
    await rejectsWith(build().service.apply(form({ email: undefined }), null), 400, "EM_EMAIL");
    await rejectsWith(build().service.apply(form({ village: undefined }), null), 400, "EM_VILLAGE");
    await rejectsWith(build().service.apply(form({ area: undefined }), null), 400, "EM_AREA");
  });
  test("an admin lists someone on a team with just name and village, approved at once (e.g. the Core Team list)", async () => {
    const { service, created } = build();
    const listing = {
      sectionKey: "HOLI",
      name: "Mahesh Patidar",
      nameHi: "महेश पाटीदार",
      village: "Ghegava",
      villageHi: "घेगांव",
      consent: true,
      approveNow: true,
      designation: "Coordinator",
      designationHi: "समन्वयक",
    } as EventMemberApplyDto;
    const result = await service.apply(listing, admin());
    const data = created[0] as Record<string, unknown>;
    assert.equal(result.status, "APPROVED");
    assert.deepEqual([data.mobileDigits, data.email, data.area, data.source, data.designation], [null, null, null, "ADMIN", "Coordinator"]);
    assert.deepEqual([data.nameHi, data.villageHi, data.designationHi], ["महेश पाटीदार", "घेगांव", "समन्वयक"]);
    assert.equal(data.approvedById, "u-admin");
    assert.equal(data.sortOrder, 8, "a new team member goes after the last one (7)");
    // A typed mobile must still be a real 10-digit number; without approveNow the entry waits like any other.
    await rejectsWith(build().service.apply({ ...listing, mobile: "123" }, admin()), 400, "EM_MOBILE");
    await rejectsWith(build().service.apply({ ...listing, village: undefined }, admin()), 400, "EM_VILLAGE");
    assert.equal((await build().service.apply({ ...listing, approveNow: undefined }, admin())).status, "PENDING");
  });
  test("an admin can add a registered member whose record has no mobile", async () => {
    const { service, db, created } = build();
    (db as unknown as { familyMember: unknown }).familyMember = {
      findFirst: mock.fn(async () => ({
        id: "m-9",
        linkedStudentId: null,
        familyId: "NPSI-FAM-9",
        photoUrl: null,
        name: "Kamal Patidar",
        mobile: null,
        email: null,
        family: { village: "Rampura", nativePlace: null },
      })),
    };
    const result = await service.apply(
      { sectionKey: "HOLI", personKind: "MEMBER", personId: "m-9", consent: true, approveNow: true } as EventMemberApplyDto,
      admin(),
    );
    assert.equal(result.status, "APPROVED");
    const data = created[0] as Record<string, unknown>;
    assert.deepEqual([data.memberId, data.name, data.village, data.mobileDigits], ["m-9", "Kamal Patidar", "Rampura", null]);
  });
  test("name + village keys: spelling variants of one village and honorifics are the same entry, other villages are not", () => {
    for (const [a, b] of [
      ["Dongargaon", "Dongargoan"],
      ["Gopal Pura", "GopalPura"],
      ["Ghegava", "Ghegawa"],
      ["Pipri", "Pipari"],
      ["Nandgoan Road", "Nandgaon Road"],
      ["balwadi", "Balwadi"],
    ])
      assert.equal(villageKey(a), villageKey(b), `${a} = ${b}`);
    for (const [a, b] of [
      ["Dasanga", "Ghegaon"],
      ["Gopal Pura", "Rampura"],
      ["Pipari", "Pandhana"],
    ])
      assert.notEqual(villageKey(a), villageKey(b), `${a} ≠ ${b}`);
    assert.equal(nameKey("Shri  Nitin Patidar"), nameKey("nitin patidar"));
    assert.equal(nameKey("Smt. Asha Patidar"), nameKey("Asha Patidar"));
    assert.ok(sameEntry({ name: "Nitin Patidar", village: "Dongargoan" }, { name: "Shri Nitin Patidar", village: "Dongargaon" }));
    assert.ok(!sameEntry({ name: "Alkesh Patidar", village: "Gopal Pura" }, { name: "Alkesh Patidar", village: "Rampura" }));
  });
  test("an admin can't add the same name and village again, even spelled differently", async () => {
    const listing = { sectionKey: "HOLI", name: "Nitin Patidar", village: "Dongargaon", consent: true, approveNow: true } as EventMemberApplyDto;
    await rejectsWith(build({ listed: [{ name: "Nitin Patidar", village: "Dongargoan" }] }).service.apply(listing, admin()), 409, "EM_SAME_ENTRY");
    // Also with a mobile typed in (the old check only covered entries without one).
    await rejectsWith(
      build({ listed: [{ name: "Shri Nitin Patidar", village: "Dongargoan" }] }).service.apply({ ...listing, mobile: "9876543210" }, admin()),
      409,
      "EM_SAME_ENTRY",
    );
  });
  test("approving or editing never makes a second card with the same name and village", async () => {
    const twin = [{ id: "a-2", name: "Asha", village: "Kasrawad" }];
    await rejectsWith(build({ listed: twin }).service.review("a-1", { decision: "APPROVED" }, admin()), 409, "EM_SAME_ENTRY");
    // The row itself is not its own duplicate.
    assert.equal(
      (await build({ listed: [{ id: "a-1", name: "Asha", village: "Kasrawad" }] }).service.review("a-1", { decision: "APPROVED" }, admin()))?.id,
      "a-1",
    );
    const approved = appRow({ status: "APPROVED" });
    await rejectsWith(
      build({ row: approved, listed: [{ id: "a-2", name: "Asha", village: "Kasrawad" }] }).service.update("a-1", { village: "kasrawad " }, admin()),
      409,
      "EM_SAME_ENTRY",
    );
    await rejectsWith(
      build({ row: approved, listed: [{ id: "a-2", name: "Mira", village: "Kasrawad" }] }).service.update("a-1", { name: "Mira" }, admin()),
      409,
      "EM_SAME_ENTRY",
    );
    assert.equal((await build({ row: approved, listed: twin }).service.update("a-1", { designation: "Coordinator" }, admin())).designation, "Coordinator");
  });
  test("the same name and village already on the team is a duplicate; members can't use the admin shortcut", async () => {
    const listing = { sectionKey: "HOLI", name: "Mahesh  Patidar", village: "ghegava", consent: true, approveNow: true } as EventMemberApplyDto;
    await rejectsWith(build({ listed: [{ name: "Mahesh Patidar", village: "Ghegava" }] }).service.apply(listing, admin()), 409, "EM_SAME_ENTRY");
    assert.equal(
      (await build({ listed: [{ name: "Mahesh Patidar", village: "Rampura" }] }).service.apply(listing, admin())).status,
      "APPROVED",
      "same name, other village",
    );
    await rejectsWith(build().service.apply(listing, user()), 400, "EM_MOBILE");
  });
  test("a logged-out visitor can not attach an existing record", async () => {
    await rejectsWith(build().service.apply(form({ personKind: "MEMBER", personId: "m-1" }), null), 403, "EM_PERSON");
  });
  test("review: reject needs a reason; approve sets the section and an active key", async () => {
    await rejectsWith(build().service.review("a-1", { decision: "REJECTED" }, admin()), 400, "EM_REASON");
    const { service, updates } = build();
    await service.review("a-1", { decision: "APPROVED" }, admin());
    assert.equal((updates[0] as { status: string }).status, "APPROVED");
    assert.equal((updates[0] as { activeKey: string }).activeKey, "ems-holi|P:9876543210");
    await rejectsWith(build().service.review("a-1", { decision: "APPROVED" }, user()), 403, "Admin access required.");
  });
  test("review of an OTHER request needs a section", async () => {
    const { service } = build({ row: appRow({ sectionId: null, customEventName: "Ganesh" }) });
    const db = service as unknown as { db: { eventMemberApplication: { findFirst: unknown } } };
    db.db.eventMemberApplication.findFirst = async () => ({ ...appRow({ sectionId: null }), section: null });
    await rejectsWith(service.review("a-1", { decision: "APPROVED" }, admin()), 400, "EM_SECTION_REQUIRED");
  });
  test("admin edits: can hide, never publish, a mobile or email the member did not agree to show", async () => {
    await rejectsWith(build().service.update("a-1", { mobilePublic: true }, admin()), 400, "EM_CONSENT_OWNER");
    await rejectsWith(build().service.update("a-1", { emailPublic: true }, admin()), 400, "EM_CONSENT_OWNER");
    const { service, updates } = build({ row: appRow({ mobilePublic: true }) });
    await service.update("a-1", { mobilePublic: false }, admin());
    assert.equal((updates[0] as { mobilePublic: boolean }).mobilePublic, false);
  });
  test("removal needs a reason and only ends the membership", async () => {
    await rejectsWith(build().service.remove("a-1", { reason: " " }, admin()), 400, "EM_REASON");
    const { service, updates } = build();
    await service.remove("a-1", { reason: "Moved away" }, admin());
    assert.deepEqual(updates[0], { status: "REMOVED", activeKey: null, rejectionReason: "Moved away" });
  });
  test("delete: admin only, 404 when missing, takes the member off the roster, then deletes the row", async () => {
    await rejectsWith(build().service.purge("a-1", user()), 403, "Admin access required.");
    const missing = build();
    (missing.db.eventMemberApplication.findFirst as unknown as { mock: { mockImplementation: (f: () => unknown) => void } }).mock.mockImplementation(
      async () => null,
    );
    await rejectsWith(missing.service.purge("a-1", admin()), 404, "EM_NOT_FOUND");
    const { service, db } = build({ row: appRow({ status: "APPROVED", rosterId: "r-1" }) });
    await service.purge("a-1", admin());
    assert.equal(db.eventRoster.updateMany.mock.callCount(), 1);
    assert.deepEqual((db.eventMemberApplication.delete.mock.calls[0].arguments as unknown[])[0], { where: { id: "a-1" } });
  });
});
