import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import type { PrismaService } from "../database/prisma.service.js";
import type { EventMemberApplication } from "../generated/prisma/client.js";
import { admin, as, fakeRecaptcha, rejectsWith, user } from "../testing/fakes.js";
import type { EventMemberApplyDto } from "./event-members.dto.js";
import { activeKeyOf, EventMembersService, toPublicCard } from "./event-members.service.js";

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

const build = ({ recaptcha = true, open = null as { id: string } | null, row = appRow() } = {}) => {
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
      create: mock.fn(async (args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return { ...appRow(), ...args.data };
      }),
      update: mock.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args.data);
        return { ...row, ...args.data };
      }),
      updateMany: mock.fn(async () => ({ count: 0 })),
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
  test("public card: no record ids, mobile and email only with consent", () => {
    const card = toPublicCard(appRow({ memberId: "m-1", studentId: "NPSI-STU-1", familyId: "NPSI-FAM-1" }));
    assert.equal(card.mobile, null);
    assert.equal(card.email, null);
    assert.ok(!JSON.stringify(card).includes("NPSI-"));
    assert.equal(toPublicCard(appRow({ mobilePublic: true, emailPublic: true })).mobile, "9876543210");
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
});
