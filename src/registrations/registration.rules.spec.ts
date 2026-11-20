import assert from "node:assert/strict";
import { test } from "node:test";
import { isPastBirthDate } from "../common/validation/fields.js";
import { assertFeeSettled, birthDateError, canResubmit, DOB_ERRORS, paymentDecisionAllowed, profileCompletion } from "./registration.rules.js";

test("payment decisions follow the payment status", () => {
  assert.equal(paymentDecisionAllowed("SUBMITTED", "VERIFIED"), true);
  assert.equal(paymentDecisionAllowed(null, "VERIFIED"), true);
  assert.equal(paymentDecisionAllowed("SUBMITTED", "REFUNDED"), false);
  assert.equal(paymentDecisionAllowed("VERIFIED", "REFUND_REQUESTED"), true);
  assert.equal(paymentDecisionAllowed("REFUND_REQUESTED", "REFUND_PROCESSING"), true);
  assert.equal(paymentDecisionAllowed("REFUND_PROCESSING", "REFUNDED"), true);
  assert.equal(paymentDecisionAllowed("VERIFIED", "REFUNDED"), false);
  assert.equal(paymentDecisionAllowed("REFUNDED", "VERIFIED"), false);
  assert.equal(paymentDecisionAllowed("REJECTED", "REJECTED"), false);
});

test("approval needs a settled fee; applications without a fee record pass", () => {
  assert.doesNotThrow(() => assertFeeSettled(undefined));
  assert.doesNotThrow(() => assertFeeSettled("VERIFIED"));
  assert.doesNotThrow(() => assertFeeSettled("SUCCESS"));
  for (const status of [null, "PENDING", "SUBMITTED", "REJECTED", "REFUNDED"])
    assert.throws(
      () => assertFeeSettled(status),
      (error: { getResponse: () => { error: string } }) => /Verify the registration payment/.test(error.getResponse().error),
    );
});

test("resubmission is open after a correction request or a rejected payment, never after a decision", () => {
  assert.equal(canResubmit("CORRECTION_REQUIRED", "VERIFIED"), true);
  assert.equal(canResubmit("PENDING_VERIFICATION", "REJECTED"), true);
  assert.equal(canResubmit("PENDING_VERIFICATION", "SUBMITTED"), false);
  assert.equal(canResubmit("APPROVED", "REJECTED"), false);
  assert.equal(canResubmit("REJECTED", "REJECTED"), false);
});

test("profile completion: a fresh account is part way, an approved complete family is 100%", () => {
  const fresh = profileCompletion({ hasEmail: false, hasPhoto: false, registration: null, approved: false, familyMembers: 0, headDetails: false });
  assert.equal(fresh.percent, 10);
  assert.equal(fresh.next?.key, "registrationSubmitted");
  const submitted = profileCompletion({
    hasEmail: true,
    hasPhoto: false,
    registration: { status: "PENDING_VERIFICATION", paymentStatus: "SUBMITTED" },
    approved: false,
    familyMembers: 0,
    headDetails: false,
  });
  assert.equal(submitted.percent, 45);
  assert.equal(submitted.next?.key, "paymentVerified");
  const done = profileCompletion({
    hasEmail: true,
    hasPhoto: true,
    registration: { status: "APPROVED", paymentStatus: "VERIFIED" },
    approved: true,
    familyMembers: 4,
    headDetails: true,
  });
  assert.deepEqual([done.percent, done.next], [100, null]);
  const student = profileCompletion({ hasEmail: true, hasPhoto: true, registration: null, approved: true, familyMembers: null, headDetails: true });
  assert.equal(student.percent, 100);
  assert.equal(
    student.steps.some((step) => step.key === "familyMembers"),
    false,
  );
});

test("birthDateError: a real past date with the minimum age for the registration type", () => {
  const today = "2026-11-14";
  assert.equal(birthDateError("2026-11-14", "FAMILY", today), DOB_ERRORS.notPast, "today is not a date of birth");
  assert.equal(birthDateError("2027-01-01", "STUDENT", today), DOB_ERRORS.notPast);
  assert.equal(birthDateError("2026-02-30", "FAMILY", today), DOB_ERRORS.invalid);
  assert.equal(birthDateError("14-11-2000", "FAMILY", today), DOB_ERRORS.invalid);
  assert.equal(birthDateError("1906-11-13", "FAMILY", today), DOB_ERRORS.tooOld);
  assert.equal(birthDateError("1906-11-14", "FAMILY", today), null, "exactly 120 years");
  assert.equal(birthDateError("2008-11-15", "FAMILY", today), DOB_ERRORS.FAMILY, "one day short of 18");
  assert.equal(birthDateError("2008-11-14", "FAMILY", today), null, "18 today");
  assert.equal(birthDateError("2023-11-15", "STUDENT", today), DOB_ERRORS.STUDENT);
  assert.equal(birthDateError("2010-05-01", "STUDENT", today), null);
});

test("a member/student birth date must be a real date before today (India time)", () => {
  assert.equal(isPastBirthDate("2026-11-13", "2026-11-14"), true);
  assert.equal(isPastBirthDate("2026-11-14", "2026-11-14"), false); // today
  assert.equal(isPastBirthDate("2026-11-15", "2026-11-14"), false); // tomorrow
  assert.equal(isPastBirthDate("2023-02-30", "2026-11-14"), false); // not a date
  assert.equal(isPastBirthDate("1850-01-01", "2026-11-14"), false);
  assert.equal(isPastBirthDate("2010-05-06T00:00:00.000Z", "2026-11-14"), true); // stored date-times read as their date
});

test("the mobile step is done only for a proven mobile number (not an admin without one, nor an emailed-code number)", () => {
  const base = { hasEmail: true, hasPhoto: false, registration: null, approved: false, familyMembers: null, headDetails: false };
  assert.equal(profileCompletion({ ...base, mobileVerified: false }).steps[0].done, false);
  assert.equal(profileCompletion({ ...base, mobileVerified: true }).steps[0].done, true);
});
