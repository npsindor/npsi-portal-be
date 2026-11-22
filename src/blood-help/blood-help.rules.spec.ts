import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOOD_GROUPS, compatibleDonors, donorEligible, mobile10, needsConfirmation, nextEligibleDate, whatsappLink } from "./blood-help.rules.js";

const at = (value: string) => new Date(`${value}T00:00:00Z`);

test("blood group compatibility: O- gives to all, AB+ receives from all", () => {
  for (const group of BLOOD_GROUPS) assert.ok(compatibleDonors(group).includes("O-"), group);
  assert.deepEqual([...compatibleDonors("AB+")].sort(), [...BLOOD_GROUPS].sort());
  assert.deepEqual(compatibleDonors("O-"), ["O-"]);
  assert.deepEqual(compatibleDonors("B+"), ["B+", "B-", "O+", "O-"]);
  assert.equal(compatibleDonors("A-").includes("A+"), false, "a negative patient never gets a positive donor");
  assert.deepEqual(compatibleDonors("X"), []);
});

test("a donor is suggested when available and 90+ days after the last donation (or never donated)", () => {
  const now = at("2026-11-22");
  assert.equal(donorEligible({ available: true, lastDonationDate: null }, now), true);
  assert.equal(donorEligible({ available: true, lastDonationDate: at("2026-08-24") }, now), true, "exactly 90 days");
  assert.equal(donorEligible({ available: true, lastDonationDate: at("2026-08-25") }, now), false, "89 days");
  assert.equal(donorEligible({ available: false, lastDonationDate: null }, now), false, "switched off");
  assert.equal(donorEligible({ available: true, lastDonationDate: at("2026-06-01") }, now, 180), false, "a longer configured gap");
  assert.equal(nextEligibleDate(at("2026-08-24"))?.toISOString().slice(0, 10), "2026-11-22");
  assert.equal(nextEligibleDate(null), null);
});

test("the requester is asked about receipt after 2 days, then again 3 days after a No; never once completed", () => {
  const now = new Date("2026-11-22T10:00:00Z");
  const base = { status: "IN_PROGRESS", createdAt: new Date("2026-11-20T09:00:00Z"), lastPromptedAt: null };
  assert.equal(needsConfirmation(base, now), true);
  assert.equal(needsConfirmation({ ...base, createdAt: new Date("2026-11-21T09:00:00Z") }, now), false, "too new");
  assert.equal(needsConfirmation({ ...base, lastPromptedAt: new Date("2026-11-21T09:00:00Z") }, now), false, "answered No yesterday");
  assert.equal(needsConfirmation({ ...base, lastPromptedAt: new Date("2026-11-18T09:00:00Z") }, now), true);
  assert.equal(needsConfirmation({ ...base, status: "COMPLETED" }, now), false);
});

test("mobile numbers and WhatsApp links", () => {
  assert.equal(mobile10("+91 98765-43210"), "9876543210");
  assert.equal(mobile10("12345"), null);
  assert.equal(mobile10("5876543210"), null, "Indian mobiles start 6–9");
  assert.equal(whatsappLink("98765 43210", "Hi & bye"), "https://wa.me/919876543210?text=Hi%20%26%20bye");
  assert.equal(whatsappLink(null, "x"), null);
});
