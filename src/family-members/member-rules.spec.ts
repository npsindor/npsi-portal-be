import assert from "node:assert/strict";
import { test } from "node:test";
import { educationNotAllowed } from "./member-rules.js";

test("education from 8th: adult relatives incl. a daughter-in-law and a younger brother's wife; a son or daughter from LKG", () => {
  for (const relationship of ["Spouse", "Brother", "Daughter-in-law", "Younger Brother's Wife", "Sister-in-law", " daughter-in-law "]) {
    assert.equal(educationNotAllowed(relationship, "5th"), true, relationship);
    assert.equal(educationNotAllowed(relationship, "8th"), false, relationship);
  }
  assert.equal(educationNotAllowed("Son", "5th"), false);
  assert.equal(educationNotAllowed("Daughter", "LKG"), false);
});
