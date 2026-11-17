import assert from "node:assert/strict";
import { test } from "node:test";
import { sagunFields } from "./sagun.fields.js";
import { ageOf, effectiveFields, publicKeys, sagunUploadMime, sanitizeData } from "./sagun.rules.js";

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
  assert.equal(sagunFields.find((field) => field.key === "identityFileId")?.required, true);
  assert.equal(sagunFields.find((field) => field.key === "identityFileId")?.hi, "आधार कार्ड की फोटो कॉपी (जेपीजी/पीएनजी/वेबपी/पीडीएफ, प्रतिबंधित)");
  assert.equal(sagunFields.find((field) => field.key === "country")?.options?.[0].value, "India");
  assert.equal(sagunFields.find((field) => field.key === "state")?.options?.[0].value, "Madhya Pradesh");
  assert.deepEqual(
    sagunFields.find((field) => field.key === "district")?.options?.map((option) => option.value),
    ["Indore", "Dewas", "Ujjain", "Khargone", "Dhar"],
  );
  assert.deepEqual(
    sagunFields.find((field) => field.key === "city")?.options?.map((option) => option.value),
    ["Indore", "Dewas", "Pithampur", "Ujjain", "Khargone"],
  );
  assert.equal(sagunFields.find((field) => field.key === "nativeVillage")?.section, "personal");
  assert.ok(
    sagunFields
      .filter((field) => ["fatherMobile", "residentialAddress", "district", "area"].includes(field.key))
      .every((field) => field.section === "personal"),
  );
  assert.ok(sanitizeData(complete(), sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), fullName: "   " }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), country: "Nepal" }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), district: "Bhopal" }, sagunFields, true));
  assert.ok(sanitizeData({ ...complete(), nativeVillage: "Pithampur", area: "Sector 1", district: "Dhar" }, sagunFields, true));
});
test("removed fields are hidden and dropped; relaxed fields stay optional even if a saved config requires them", () => {
  const removed = ["candidateMobile", "motherMobile", "email", "city", "officeAddress", "professionalDetails", "fatherGotra"];
  const fields = effectiveFields([
    { key: "company", required: true },
    { key: "monthlyIncome", required: true },
    { key: "mamaGotra", required: true },
    { key: "brothers", required: true },
    { key: "sisters", required: true },
    { key: "fatherGotra", required: true, enabled: true },
  ]);
  for (const key of removed)
    assert.equal(
      fields.some((field) => field.key === key),
      false,
      key,
    );
  for (const key of ["company", "monthlyIncome", "mamaGotra", "brothers", "sisters"])
    assert.equal(fields.find((field) => field.key === key)?.required, false, key);
  const complete = Object.fromEntries(
    fields
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
                : field.type === "tel"
                  ? "9000000000"
                  : field.key === "pincode"
                    ? "452001"
                    : "Test",
      ]),
  );
  const saved = sanitizeData({ ...complete, candidateMobile: "9000000000", email: "a@b.co", fatherGotra: "X", city: "Mhow" }, fields, true);
  for (const key of removed) assert.equal(key in saved, false, key);
});
test("eligibility uses completed years and blocks underage profiles and invalid dates", () => {
  assert.equal(ageOf("2005-10-28", "2026-10-28"), 21);
  assert.equal(ageOf("2005-10-29", "2026-10-28"), 20);
  assert.throws(() => sanitizeData({ ...complete(), dob: "2020-01-01" }, sagunFields, true));
  assert.throws(() => sanitizeData({ ...complete(), dob: "1995-02-30" }, sagunFields, true));
});
test("private Shagun uploads are typed by their bytes, not the browser's MIME or file name", () => {
  const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  assert.equal(sagunUploadMime(webp, "PHOTO", "image/webp", "portrait.webp"), "image/webp");
  // Genuine photos that browsers label oddly (".jfif", "image/jpg", no extension) are accepted.
  assert.equal(sagunUploadMime(jpg, "PHOTO", "image/jpeg", "whatsapp.jfif"), "image/jpeg");
  assert.equal(sagunUploadMime(jpg, "PHOTO", "image/jpg", "photo.jpg"), "image/jpeg");
  assert.equal(sagunUploadMime(jpg, "PHOTO", "application/octet-stream", "image"), "image/jpeg");
  // Anything that is not really an image is refused, whatever it claims to be.
  assert.equal(sagunUploadMime(Buffer.from("<html><script>"), "PHOTO", "image/png", "portrait.png"), null);
  assert.equal(sagunUploadMime(Buffer.from("%PDF-1.4"), "PHOTO", "application/pdf", "portrait.pdf"), null);
  assert.equal(sagunUploadMime(Buffer.from("%PDF-1.4"), "IDENTITY", "application/pdf", "aadhaar.pdf"), "application/pdf");
});
test("optional Shagun is never mandatory; amounts cannot be negative and must be voluntary", () => {
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
  assert.equal(
    fields.some((field) => field.key === "cashSagun"),
    false,
  );
  assert.equal(
    fields.some((field) => field.section === "sagun"),
    false,
  );
  assert.equal(fields.find((field) => field.key === "identityFileId")?.required, true);
  assert.equal(fields.find((field) => field.key === "college")?.required, true);
});
test("member-facing fields exclude full birth date, contact, income, addresses, identity and Shagun", () => {
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
