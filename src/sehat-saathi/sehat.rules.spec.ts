import assert from "node:assert/strict";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ResourceDto, SehatMrDto, SehatRequestDto } from "./sehat.dto.js";
import { regionKey } from "./sehat.rules.js";

test("Hindi and English city and area keys match without changing stored display text", () => {
  assert.equal(regionKey("इंदौर"), regionKey("INDORE"));
  assert.equal(regionKey("विजय नगर"), regionKey("Vijay Nagar"));
  assert.equal(regionKey("भंवरकुआँ"), regionKey("Bhawarkuan"));
  assert.notEqual(regionKey("Vijay Nagar"), regionKey("Palasia"));
});
test("medicine requests reject absent consent, non-positive quantity and invalid contacts", () => {
  const body = plainToInstance(SehatRequestDto, {
    clientRequestId: crypto.randomUUID(),
    medicine: "Test",
    quantity: 0,
    assistance: "ALTERNATIVES",
    city: "Indore",
    area: "Vijay Nagar",
    name: "Test",
    phone: "123",
    emailOptIn: false,
    whatsappOptIn: false,
    lang: "hi",
    consent: false,
  });
  assert.equal(validateSync(body).length, 3);
});
test("MR registration requires actual professional fields, bounded service areas and explicit contact choices", () => {
  const body = plainToInstance(SehatMrDto, {
    name: "Test",
    membershipId: "TEST",
    company: "Test",
    role: "MR",
    city: "Indore",
    areas: [],
    phone: "9000000000",
    assistance: "BOTH",
    emailOptIn: false,
    whatsappOptIn: false,
    lang: "hi",
    consent: true,
  });
  assert.ok(validateSync(body).some((error) => error.property === "areas"));
  assert.ok(validateSync(body).some((error) => error.property === "publishContact"));
});
test("health resource URLs cannot use javascript or insecure HTTP", () => {
  for (const url of ["javascript:alert(1)", "http://example.invalid"]) {
    const body = plainToInstance(ResourceDto, {
      titleEn: "Test",
      titleHi: "परीक्षण",
      descriptionEn: "Test",
      descriptionHi: "परीक्षण",
      source: "Test",
      url,
      category: "HEALTH",
      published: true,
      verified: true,
    });
    assert.ok(validateSync(body).some((error) => error.property === "url"));
  }
});
