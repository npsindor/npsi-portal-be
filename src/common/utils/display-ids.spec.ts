import assert from "node:assert/strict";
import { test } from "node:test";
import { displayIdPrefixRange } from "./display-ids.js";

test("display-ID ranges include their prefix and exclude adjacent prefixes", () => {
  for (const prefix of ["NPSI-APP-2026-", "NPSI-STU-APP-2026-", "NPSI-FAM-", "NPSI-MEM-", "NPSI-STU-", "TRF-", "FB-", "EVT-REG-", "TXN-"]) {
    const { gte, lt } = displayIdPrefixRange(prefix);
    for (const suffix of ["", "000001", "999999", "1000000"]) {
      const id = prefix + suffix;
      assert.ok(id >= gte && id < lt, id);
    }
    for (const id of [prefix.slice(0, -1), lt, `${lt}000001`, `OTHER-${prefix}000001`]) {
      assert.ok(!(id >= gte && id < lt), id);
    }
  }
});

test("display-ID ranges reject unsupported prefixes", () => {
  for (const prefix of ["", "NPSI", "NPSI-%-", "नमस्ते-"]) {
    assert.throws(() => displayIdPrefixRange(prefix), /Invalid display-ID prefix/);
  }
});
