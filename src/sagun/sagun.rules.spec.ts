import assert from "node:assert/strict";
import { test } from "node:test";
import { sagunFields } from "./sagun.fields.js";
import { ageOf, effectiveFields, publicKeys, sanitizeData } from "./sagun.rules.js";

const complete = (): Record<string, unknown> =>
  Object.fromEntries(
    sagunFields
      .filter((field) => field.required)
      .map((field) => [
        field.key,
        field.type === "checkbox"
          ? true
          : field.type === "number"
            ? (field.min ?? 1)
            : field.type === "select"
              ? field.options?.[0].value
              : field.type === "date"
                ? "1995-01-01"
                : field.type === "photo"
                  ? "test-photo"
                  : field.type === "tel"
                    ? "9000000000"
                    : field.key === "pincode"
                      ? "452001"
                      : "Test",
      ]),
  );
test("drafts allow missing fields but submitted profiles require all configured mandatory fields", () => {
  assert.deepEqual(sanitizeData({ visibility: "PRIVATE" }, sagunFields, false), { visibility: "PRIVATE" });
  assert.throws(() => sanitizeData({}, sagunFields, true));
  assert.ok(sanitizeData(complete(), sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), fullName: "   " }, sagunFields, true));
});
test("eligibility uses completed years and blocks underage profiles and invalid dates", () => {
  assert.equal(ageOf("2005-10-28", "2026-10-28"), 21);
  assert.equal(ageOf("2005-10-29", "2026-10-28"), 20);
  assert.throws(() => sanitizeData({ ...complete(), dob: "2020-01-01" }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), dob: "1995-02-30" }, sagunFields, true));
});
test("optional Sagun is never mandatory; amounts cannot be negative and must be voluntary", () => {
  assert.ok(sanitizeData(complete(), sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), cashSagun: 100 }, sagunFields, true));
  assert.ok(
    sanitizeData(
      { ...complete(), cashSagun: 0, voluntaryConsent: true, sagunItems: [{ name: "Coconut", quantity: "1", value: "", offeredBy: "BRIDE_FAMILY" }] },
      sagunFields,
      true,
    ),
  );
  assert.throws(() => sanitizeData({ ...complete(), cashSagun: -1, voluntaryConsent: true }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), sagunItems: [{ quantity: "2" }], voluntaryConsent: true }, sagunFields, true));
});
test("sibling counts and preference ranges are validated", () => {
  assert.throws(() => sanitizeData({ ...complete(), brothers: 0, marriedBrothers: 1 }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), preferredAgeMin: 30, preferredAgeMax: 20 }, sagunFields, true));
});
test("configuration cannot remove consent/eligibility protection or require customary offerings", () => {
  const fields = effectiveFields([
    { key: "dob", required: false, enabled: false },
    { key: "cashSagun", required: true },
    { key: "identityFileId", required: true },
    { key: "college", required: true, en: "University" },
  ]);
  assert.equal(fields.find((field) => field.key === "dob")?.required, true);
  assert.equal(fields.find((field) => field.key === "dob")?.enabled, true);
  assert.equal(fields.find((field) => field.key === "cashSagun")?.required, false);
  assert.equal(fields.find((field) => field.key === "identityFileId")?.required, false);
  assert.equal(fields.find((field) => field.key === "college")?.required, true);
});
test("member-facing fields exclude full birth date, contact, income, addresses, identity and Sagun", () => {
  for (const key of [
    "dob",
    "birthTime",
    "candidateMobile",
    "fatherMobile",
    "monthlyIncome",
    "residentialAddress",
    "officeAddress",
    "identityFileId",
    "kundliFileId",
    "cashSagun",
    "sagunItems",
  ])
    assert.equal(publicKeys.includes(key), false);
  assert.throws(() => sanitizeData({ ...complete(), role: "admin" }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), sagunItems: [{ name: "Test", arbitrary: {} }] }, sagunFields, true));
});

test("gift-list metadata accepts only valid recipients, record types and dates", () => {
  const data = {
    ...complete(),
    voluntaryConsent: true,
    sagunItems: [{ name: "Coconut", donorName: "Test", donorRelationship: "Uncle", recipient: "BRIDE", recordStatus: "GIVEN", givenOn: "2026-10-29" }],
  };
  assert.equal((sanitizeData(data, sagunFields, true).sagunItems as Record<string, string>[])[0].donorName, "Test");
  for (const change of [{ recipient: "PUBLIC" }, { recordStatus: "PAID" }, { givenOn: "2026-02-30" }])
    assert.throws(() => sanitizeData({ ...data, sagunItems: [{ ...data.sagunItems[0], ...change }] }, sagunFields, true));
});
