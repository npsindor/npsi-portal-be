import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ApiError } from "./api-error.js";
import { toErrorResponse } from "./http-error.filter.js";

describe("toErrorResponse", () => {
  test("our errors keep their status and message", () => {
    assert.deepEqual(toErrorResponse(new ApiError(409, "Taken.")), { status: 409, body: { error: "Taken." } });
  });
  test("a broken reference (Prisma P2003) is a 400, without database details", () => {
    assert.deepEqual(
      toErrorResponse(Object.assign(new Error("Foreign key constraint violated on the constraint: `family_members_family_id_fkey`"), { code: "P2003" })),
      {
        status: 400,
        body: { error: "A referenced record does not exist." },
      },
    );
  });
  test("anything else is a 500", () => {
    assert.equal(toErrorResponse(new Error("boom")).status, 500);
  });
});
