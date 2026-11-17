import assert from "node:assert/strict";
import { test } from "node:test";
import type { SagunDigitalCard, SagunProfile } from "../generated/prisma/client.js";
import { sagunFields } from "../sagun/sagun.fields.js";
import { INDEX_ROWS_PER_PAGE, planBooklet } from "./sagun-booklet.plan.js";
import { splitRuns } from "./sagun-card.pdf.js";
import { newVerifyToken, profileCodeOf } from "./sagun-card.records.js";
import { bookletBlocker, buildCardView, heightText } from "./sagun-card.view.js";

const consents = { candidateConsent: true, displayConsent: true, termsConsent: true, matrimonialConsent: true, accuracyConsent: true };
const profile = (data: Record<string, unknown>, over: Partial<SagunProfile> = {}) =>
  ({
    id: "p1",
    userId: "u1",
    reference: "SAGUN-1",
    data: { candidateType: "GROOM", fullName: "रोहित पाटीदार", ...consents, ...data },
    displayName: "रोहित पाटीदार",
    candidateType: "GROOM",
    birthDate: new Date("1998-11-14T00:00:00Z"),
    city: "",
    gotra: "",
    education: "",
    occupation: "",
    maritalStatus: "",
    status: "APPROVED",
    visibility: "MEMBERS",
    reviewNotes: null,
    familyId: "NPSI-FAM-000001",
    memberId: "m1",
    studentId: null,
    village: "",
    ageAtSubmission: 27,
    submittedAt: new Date("2026-11-01T00:00:00Z"),
    approvedAt: new Date("2026-11-02T00:00:00Z"),
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-02T00:00:00Z"),
    files: [{ id: "f1", kind: "PHOTO" }],
    user: { status: "active" },
    digitalCard: {
      id: "c1",
      profileId: "p1",
      serial: 7,
      profileCode: "SB-2026-0007",
      verifyToken: "tok_abcdefghijklmnopqrstuv",
      designVersion: 1,
      selectedForBooklet: true,
      lastPublishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies SagunDigitalCard,
    ...over,
  }) as SagunProfile & { digitalCard: SagunDigitalCard; files: { id: string; kind: string }[]; user: { status: string } };

const full = {
  fatherName: "महेश पाटीदार",
  fatherMobile: "+91 98765-43210",
  dob: "1998-11-14",
  height: 175,
  education: "B.Tech",
  occupation: "इंजीनियर",
  nativeVillage: "टेमला",
  district: "Khargone",
};

test("profile codes and verification tokens", () => {
  assert.equal(profileCodeOf(7, 2026), "SB-2026-0007");
  assert.equal(profileCodeOf(12345, 2027), "SB-2027-12345");
  const token = newVerifyToken();
  assert.match(token, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(token, newVerifyToken());
});

test("without the booklet consent the card shows age only, never father's name, mobile or birth date", () => {
  const view = buildCardView(profile(full), sagunFields, "https://npsindore.org", true, "2026-11-15");
  const keys = view.rows.map((row) => row.key);
  assert.deepEqual(keys, ["name", "birth", "height", "education", "occupation", "place"]);
  assert.equal(view.rows.find((row) => row.key === "birth")?.value, "28 वर्ष");
  assert.equal(view.rows.find((row) => row.key === "birth")?.label, "आयु");
  assert.equal(JSON.stringify(view).includes("98765"), false);
  assert.equal(JSON.stringify(view).includes("महेश"), false);
  assert.equal(view.verifyUrl, "https://npsindore.org/sagun/verify/tok_abcdefghijklmnopqrstuv");
});

test("with the booklet consent the card adds father's name, mobile and full birth date", () => {
  const view = buildCardView(profile({ ...full, bookletContactConsent: true }), sagunFields, "https://npsindore.org", true, "2026-11-15");
  const value = (key: string) => view.rows.find((row) => row.key === key)?.value;
  assert.equal(value("father"), "महेश पाटीदार");
  assert.equal(value("mobile"), "98765 43210");
  assert.equal(value("birth"), "14-11-1998 (28 वर्ष)");
  assert.equal(value("height"), heightText(175));
  assert.equal(value("place"), "टेमला, खरगोन");
  assert.equal(view.rows.find((row) => row.key === "name")?.label, "युवक का नाम");
});

test("blank fields are left off the card", () => {
  const view = buildCardView(profile({ bookletContactConsent: true, fatherName: "  ", education: "" }), sagunFields, "", true, "2026-11-15");
  assert.deepEqual(
    view.rows.map((row) => row.key),
    ["name", "birth"],
  );
  assert.equal(heightText(175), "175 सेमी (5'9\")");
});

test("only approved, member-visible profiles with every consent, an active owner and a photo can go into a booklet", () => {
  const ok = profile(full);
  assert.equal(bookletBlocker(ok, true, true), null);
  assert.equal(bookletBlocker(profile(full, { status: "SUBMITTED" }), true, true), "NOT_APPROVED");
  assert.equal(bookletBlocker(ok, false, true), "PROFILES_HIDDEN");
  assert.equal(bookletBlocker(profile(full, { visibility: "PRIVATE" }), true, true), "PRIVATE_PROFILE");
  assert.equal(bookletBlocker(ok, true, false), "OWNER_INACTIVE");
  assert.equal(bookletBlocker(profile({ ...full, displayConsent: false }), true, true), "CONSENT_MISSING");
  assert.equal(bookletBlocker(profile(full, { files: [] } as never), true, true), "NO_PHOTO");
  // A selected card that stops being eligible is not reported as selected.
  const hidden = buildCardView(profile(full, { visibility: "PRIVATE" }), sagunFields, "", true, "2026-11-15");
  assert.equal(hidden.selected, false);
  assert.equal(hidden.bookletEligible, false);
});

test("booklet plan: cover, index with the right page numbers, grooms then brides, never splitting a card", () => {
  const cards = [
    ...Array.from({ length: 5 }, (_, index) => ({ profileId: `g${index}`, category: "GROOM" as const })),
    ...Array.from({ length: 3 }, (_, index) => ({ profileId: `b${index}`, category: "BRIDE" as const })),
  ];
  const pages = planBooklet(cards, { layout: 2, grouping: "SEPARATE", includeCover: true, includeIndex: true, includeClosing: true });
  assert.deepEqual(
    pages.map((page) => page.kind),
    ["cover", "index", "cards", "cards", "cards", "cards", "cards", "closing"],
  );
  const cardPages = pages.filter((page) => page.kind === "cards");
  assert.deepEqual(
    cardPages.map((page) => (page.kind === "cards" ? `${page.section}:${page.cards.length}` : "")),
    ["GROOM:2", "GROOM:2", "GROOM:1", "BRIDE:2", "BRIDE:1"],
  );
  const index = pages[1];
  assert.equal(index.kind, "index");
  if (index.kind === "index") {
    assert.equal(index.entries.length, 8);
    assert.deepEqual(
      index.entries.map((entry) => entry.page),
      [3, 3, 4, 4, 5, 6, 6, 7],
    );
    assert.equal(index.entries[5].card.profileId, "b0");
  }
  assert.deepEqual(
    pages.map((page) => page.number),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test("booklet plan: together, 4 per page, no cover or index; long lists get several index pages", () => {
  const cards = Array.from({ length: 9 }, (_, index) => ({ profileId: `p${index}`, category: index % 2 ? ("BRIDE" as const) : ("GROOM" as const) }));
  const pages = planBooklet(cards, { layout: 4, grouping: "TOGETHER", includeCover: false, includeIndex: false, includeClosing: false });
  assert.deepEqual(
    pages.map((page) => (page.kind === "cards" ? page.cards.length : page.kind)),
    [4, 4, 1],
  );
  const many = Array.from({ length: INDEX_ROWS_PER_PAGE + 1 }, (_, index) => ({ profileId: `p${index}`, category: "GROOM" as const }));
  const withIndex = planBooklet(many, { layout: 1, grouping: "SEPARATE", includeCover: false, includeIndex: true, includeClosing: false });
  const indexes = withIndex.filter((page) => page.kind === "index");
  assert.equal(indexes.length, 2);
  if (indexes[1].kind === "index")
    assert.deepEqual(
      indexes[1].entries.map((entry) => entry.page),
      [INDEX_ROWS_PER_PAGE + 3],
    );
});

test("mixed Hindi/English text is split into runs for the two fonts", () => {
  assert.deepEqual(splitRuns("NPS Indore – परिवार का अभिन्न अंग"), [
    { dev: false, text: "NPS Indore – " },
    { dev: true, text: "परिवार का अभिन्न अंग" },
  ]);
  assert.deepEqual(splitRuns("98765 43210"), [{ dev: false, text: "98765 43210" }]);
  assert.deepEqual(splitRuns("युवक · Groom"), [
    { dev: true, text: "युवक " },
    { dev: false, text: "· Groom" },
  ]);
});
