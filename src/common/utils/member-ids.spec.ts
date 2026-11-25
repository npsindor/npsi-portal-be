import assert from "node:assert/strict";
import { test } from "node:test";
import { familyNumber, isHeadRelationship, memberIdPrefix, nextMemberIds } from "./member-ids.js";

test("member ids carry the family's number and the member's place in it", () => {
  assert.equal(familyNumber("NPSI-FAM-000001"), "000001");
  assert.equal(familyNumber("PSI-FAM-25"), "000025");
  assert.equal(memberIdPrefix("NPSI-FAM-000025"), "NPSI-MEB-000025");
  assert.deepEqual(nextMemberIds("NPSI-FAM-000001", []), ["NPSI-MEB-00000101"]);
  assert.deepEqual(nextMemberIds("NPSI-FAM-000025", ["NPSI-MEB-00002502", "NPSI-MEB-00002501", "NPSI-MEM-000099", null], 2), [
    "NPSI-MEB-00002503",
    "NPSI-MEB-00002504",
  ]);
  assert.deepEqual(nextMemberIds("NPSI-FAM-000001", ["NPSI-MEB-00000199"]), ["NPSI-MEB-000001100"], "a 100th member still gets an id");
});

test("a family id without a number keeps the old global sequence", () => {
  assert.equal(familyNumber("LEGACY"), null);
  assert.deepEqual(nextMemberIds("LEGACY", ["NPSI-MEM-000051"]), ["NPSI-MEM-000052"]);
});

test("the head is recognised however it is written", () => {
  assert.equal(isHeadRelationship(" Head "), true);
  assert.equal(isHeadRelationship("self"), true);
  assert.equal(isHeadRelationship("Son"), false);
});
