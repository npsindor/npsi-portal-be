import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { escapeLike, normalizeName, withContactFields } from "./text.js";

describe("names are stored tidy", () => {
  test("normalizeName trims and collapses repeated spaces, tabs and newlines", () => {
    assert.equal(normalizeName("Sanjay  Patidar"), "Sanjay Patidar");
    assert.equal(normalizeName("  Ram \t Kumar\nPatidar  "), "Ram Kumar Patidar");
    assert.equal(normalizeName("सुरेश  पाटीदार"), "सुरेश पाटीदार");
    assert.equal(normalizeName("Asha"), "Asha");
  });
  test("withContactFields tidies every name field it is given and leaves other fields alone", () => {
    const out = withContactFields(
      { familyHeadName: "Sanjay  Patidar", headName: " Ram ", name: "Sita  Bai", fatherName: null, address: "12,  MG Road", mobile: "+91 77228 29772" },
      "mobile",
      "mobileDigits",
    );
    assert.deepEqual(out, {
      familyHeadName: "Sanjay Patidar",
      headName: "Ram",
      name: "Sita Bai",
      fatherName: null,
      address: "12,  MG Road",
      mobile: "+91 77228 29772",
      mobileDigits: "7722829772",
    });
  });
  test("an update without name fields doesn't add any", () => {
    assert.deepEqual(withContactFields({ status: "APPROVED" }, "mobile", "mobileDigits"), { status: "APPROVED" });
  });
});

test("escapeLike: % _ and \\ in typed search text are matched literally, not as LIKE wildcards", () => {
  assert.equal(escapeLike("100%"), "100\\%");
  assert.equal(escapeLike("a_b"), "a\\_b");
  assert.equal(escapeLike("C:\\x"), "C:\\\\x");
  assert.equal(escapeLike("पाटीदार NPSI-FAM-1"), "पाटीदार NPSI-FAM-1");
});
