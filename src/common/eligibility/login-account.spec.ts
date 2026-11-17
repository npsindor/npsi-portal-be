import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Db } from "../../database/prisma.service.js";
import { type FakeAccountRecords, fakeAccountDb } from "../../testing/fake-repo.js";
import { user } from "../../testing/fakes.js";
import { bindsToFamily, loginAccount, loginAccountForEmail } from "./login-account.js";

const me = user({ id: "u-1", email: "member@example.com" });
const resolve = (records: FakeAccountRecords, who = me) => loginAccount(fakeAccountDb(records) as unknown as Db, who);

describe("loginAccount: the portal comes from the registration records", () => {
  test("no records: a new account that may start either registration", async () => {
    assert.deepEqual(await resolve({}), { type: "NONE", status: "NONE", familyId: null, studentId: null, dual: false });
  });
  test("family owner, family email, or member email make a Family Member account", async () => {
    assert.equal((await resolve({ families: [{ ownerUserId: "u-1", familyId: "F1", status: "ACTIVE" }] })).type, "FAMILY");
    assert.equal((await resolve({ families: [{ email: "MEMBER@example.com", familyId: "F1", status: "ACTIVE" }] })).familyId, "F1");
    const member = await resolve({ members: [{ email: "member@example.com", familyId: "F2", status: "ACTIVE", family: { status: "SUSPENDED" } }] });
    assert.deepEqual([member.type, member.status], ["FAMILY", "SUSPENDED"], "a member is only as active as the family");
  });
  test("student record by user id or email makes a Student account; a TRANSFERRED one does not", async () => {
    assert.equal((await resolve({ students: [{ userId: "u-1", studentId: "S1", status: "ACTIVE" }] })).type, "STUDENT");
    assert.equal((await resolve({ students: [{ email: "member@example.com", studentId: "S1", status: "ACTIVE" }] })).studentId, "S1");
    assert.equal((await resolve({ students: [{ userId: "u-1", studentId: "S1", status: "TRANSFERRED" }] })).type, "NONE");
  });
  test("pending, correction and rejected registrations bind the account with that status", async () => {
    assert.deepEqual(Object.values(await resolve({ studentApplications: [{ userId: "u-1", status: "PENDING_VERIFICATION" }] })).slice(0, 2), [
      "STUDENT",
      "PENDING",
    ]);
    assert.equal((await resolve({ applications: [{ userId: "u-1", status: "CORRECTION_REQUIRED" }] })).status, "CORRECTION_REQUIRED");
    assert.equal((await resolve({ applications: [{ email: "member@example.com", status: "REJECTED" }] })).status, "REJECTED");
  });
  test("both kinds: the approved one wins; equal standing goes to the family and marks the login dual", async () => {
    const upgrading = await resolve({
      students: [{ userId: "u-1", studentId: "S1", status: "ACTIVE" }],
      applications: [{ userId: "u-1", status: "PENDING_VERIFICATION" }],
    });
    assert.equal(upgrading.type, "STUDENT", "a student who applied to join a family stays a student until approval");
    const moved = await resolve({
      students: [{ userId: "u-1", studentId: "S1", status: "TRANSFERRED" }],
      families: [{ ownerUserId: "u-1", familyId: "F1", status: "ACTIVE" }],
    });
    assert.equal(moved.type, "FAMILY");
    const both = await resolve({
      students: [{ email: "member@example.com", studentId: "S1", status: "ACTIVE" }],
      families: [{ ownerUserId: "u-1", familyId: "F1", status: "ACTIVE" }],
    });
    assert.deepEqual([both.type, both.dual, both.studentId], ["FAMILY", true, null]);
  });
  test("administrators are ADMIN whatever else is attached", async () => {
    assert.equal((await resolve({ students: [{ userId: "u-9", status: "ACTIVE" }] }, user({ id: "u-9", role: "admin" }))).type, "ADMIN");
  });
  test("loginAccountForEmail and bindsToFamily", async () => {
    const db = fakeAccountDb({ users: [me], families: [{ ownerUserId: "u-1", familyId: "F1", status: "ACTIVE" }] }) as unknown as Db;
    assert.equal(await loginAccountForEmail(db, "nobody@example.com"), null);
    const account = await loginAccountForEmail(db, " Member@Example.com ");
    assert.equal(bindsToFamily(account), true);
    assert.equal(bindsToFamily({ type: "FAMILY", status: "REJECTED", familyId: null, studentId: null, dual: false }), false);
    assert.equal(bindsToFamily({ type: "STUDENT", status: "ACTIVE", familyId: null, studentId: "S1", dual: false }), false);
    assert.equal(bindsToFamily(null), false);
  });
});
