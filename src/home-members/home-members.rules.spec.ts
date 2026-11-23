import assert from "node:assert/strict";
import { test } from "node:test";
import { ageOn, isBirthdayOn, isHead } from "./home-members.rules.js";

const at = (value: string) => new Date(`${value}T00:00:00Z`);

test("a birthday is the same day and month; 29 February is wished on 28 February in other years", () => {
  assert.equal(isBirthdayOn(at("1990-11-22"), "2026-11-22"), true);
  assert.equal(isBirthdayOn(at("1990-11-21"), "2026-11-22"), false);
  assert.equal(isBirthdayOn(at("2000-02-29"), "2026-02-28"), true);
  assert.equal(isBirthdayOn(at("2000-02-29"), "2028-02-28"), false, "a leap year has its own 29th");
  assert.equal(isBirthdayOn(at("2000-02-29"), "2028-02-29"), true);
});

test("age in whole years; only heads count as heads", () => {
  assert.equal(ageOn(at("2008-11-22"), "2026-11-22"), 18);
  assert.equal(ageOn(at("2008-11-23"), "2026-11-22"), 17);
  assert.deepEqual(["Head", " head ", "Self", "Son", null].map(isHead), [true, true, true, false, false]);
});
