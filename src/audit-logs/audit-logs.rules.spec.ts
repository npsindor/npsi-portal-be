import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanSnapshot, labelOf, resourceOf } from "./audit-logs.rules.js";

test("resource names come from the route without parameters", () => {
  assert.equal(resourceOf("/families/:id"), "families");
  assert.equal(resourceOf("/event-finance/admin/events/:eventId/expenses/:id"), "event-finance / admin / events / expenses");
  assert.equal(resourceOf("/"), "unknown");
});

test("the copy of a deleted record drops secrets and keeps the rest", () => {
  const snapshot = cleanSnapshot({
    id: "u1",
    email: "a@b.c",
    passwordHash: "x",
    sessionToken: "y",
    otpHash: "z",
    amount: { toJSON: () => "500.00" },
    at: new Date("2026-11-22T00:00:00Z"),
  });
  assert.deepEqual(snapshot, { id: "u1", email: "a@b.c", amount: "500.00", at: "2026-11-22T00:00:00.000Z" });
  assert.equal(cleanSnapshot(null), null);
  const big = cleanSnapshot({ text: "x".repeat(30000) }) as { truncated: boolean };
  assert.equal(big.truncated, true);
});

test("a readable label from the record's own name fields", () => {
  assert.equal(labelOf({ id: "1", name: "  Ravi   Patidar " }), "Ravi Patidar");
  assert.equal(labelOf({ id: "1", familyId: "NPSI-FAM-000024" }), "NPSI-FAM-000024");
  assert.equal(labelOf({ id: "1" }), null);
});
