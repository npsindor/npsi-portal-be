import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "../database/prisma.service.js";
import { addRegistrationDonor } from "./registration-donor.js";

// An in-memory bloodDonor table: just what addRegistrationDonor uses.
const fakeDb = (rows: Array<Record<string, unknown>> = []) => {
  const db = {
    rows,
    bloodDonor: {
      findUnique: async ({ where }: { where: { userId: string } }) => rows.find((row) => row.userId === where.userId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        rows.push(data);
        return data;
      },
    },
  };
  return db as unknown as Db & { rows: typeof rows };
};
const entry = { userId: "user-1", bloodGroup: "B+", name: "  Ramesh   Patidar ", mobile: "+91 98765 43210", city: "Indore" };

test("an approved registration with a blood group adds the applicant to the donor list, available", async () => {
  const db = fakeDb();
  assert.equal(await addRegistrationDonor(db, entry), true);
  assert.equal(db.rows.length, 1);
  assert.deepEqual(
    { ...db.rows[0], id: undefined },
    {
      id: undefined,
      userId: "user-1",
      bloodGroup: "B+",
      name: "Ramesh Patidar",
      mobile: "9876543210",
      city: "Indore",
      available: true,
    },
  );
});

test("no donor entry without a blood group, an unknown group or an account", async () => {
  const db = fakeDb();
  assert.equal(await addRegistrationDonor(db, { ...entry, bloodGroup: null }), false);
  assert.equal(await addRegistrationDonor(db, { ...entry, bloodGroup: "C+" }), false);
  assert.equal(await addRegistrationDonor(db, { ...entry, userId: null }), false);
  assert.equal(db.rows.length, 0);
});

test("an existing donor keeps their own entry", async () => {
  const db = fakeDb([{ id: "d1", userId: "user-1", bloodGroup: "O-", available: false }]);
  assert.equal(await addRegistrationDonor(db, entry), false);
  assert.deepEqual(db.rows, [{ id: "d1", userId: "user-1", bloodGroup: "O-", available: false }]);
});
