import assert from "node:assert/strict";
import { test } from "node:test";
import { displayName, matchScore, mobile10, normalKey, notifiable } from "./room-hunting.rules.js";

const listing = (over = {}) => ({ typeKey: "1bhk", areaKey: "vijaynagar", rentAmount: 9000, availableFor: "ANY", ...over });
const need = (over = {}) => ({ typeKey: "1bhk", areaKey: "vijaynagar", maxBudget: 10000, tenantType: "ANY", ...over });

test("type and area keys ignore case, spaces and punctuation", () => {
  assert.equal(normalKey("1-BHK"), normalKey("1 bhk"));
  assert.equal(normalKey(" Vijay  Nagar "), "vijaynagar");
  assert.equal(normalKey("Hostel / PG"), "hostelpg");
});

test("exact type + area + budget scores highest and notifies the owner", () => {
  assert.equal(matchScore(need(), listing()), 100);
  assert.equal(notifiable(need(), listing()), true);
});

test("other area or related type is still a (weaker) match, but the owner is not notified", () => {
  assert.ok(matchScore(need(), listing({ areaKey: "rau" })) > 0);
  assert.equal(notifiable(need(), listing({ areaKey: "rau" })), false);
  assert.ok(matchScore(need({ typeKey: "flat" }), listing()) > 0);
});

test("unrelated type, rent far over budget or wrong tenant category never match", () => {
  assert.equal(matchScore(need({ typeKey: "singleroom" }), listing({ typeKey: "3bhk" })), 0);
  assert.equal(matchScore(need({ maxBudget: 5000 }), listing()), 0);
  assert.equal(matchScore(need({ tenantType: "STUDENT" }), listing({ availableFor: "FAMILY" })), 0);
  assert.ok(matchScore(need({ tenantType: "STUDENT" }), listing({ availableFor: "ANY" })) > 0);
});

test("rent up to 10% over budget is a weak match only", () => {
  const score = matchScore(need({ maxBudget: 8500 }), listing());
  assert.ok(score > 0 && score < 100);
  assert.equal(notifiable(need({ maxBudget: 8500 }), listing()), false);
});

test("mobile numbers are 10-digit Indian numbers; public names are shortened", () => {
  assert.equal(mobile10("+91 98765 43210"), "9876543210");
  assert.equal(mobile10("09876543210"), "9876543210");
  assert.equal(mobile10("12345"), null);
  assert.equal(mobile10("5876543210"), null);
  assert.equal(displayName("Ramesh Kumar Patidar"), "Ramesh P.");
  assert.equal(displayName("Ramesh"), "Ramesh");
});
