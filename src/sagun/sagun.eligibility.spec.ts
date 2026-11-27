import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SETTINGS,
  eligibilityError,
  evaluateMember,
  type FamilyFacts,
  genderOf,
  type MemberRecord,
  minimumAgeFor,
  ownerMayEdit,
  prefillFrom,
  type RelativeFacts,
  reviewAllowed,
} from "./sagun.eligibility.js";

const TODAY = "2026-11-10";
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const member = (overrides: Partial<MemberRecord> = {}): MemberRecord => ({
  id: "m-son",
  membershipId: "NPSI-MEM-000010",
  name: "Rahul Patidar",
  relationship: "Son",
  gender: "Male",
  dob: date("2000-01-01"),
  status: "ACTIVE",
  mobile: "+91 98765 43210",
  email: "rahul@example.com",
  education: "B.E.",
  occupation: "Engineer",
  address: null,
  ...overrides,
});
const family: FamilyFacts = {
  familyId: "NPSI-FAM-000001",
  headName: "Ramesh Patidar",
  address: "12 MG Road, Indore",
  city: "indore",
  district: "Indore",
  pincode: "452001",
  village: "Sanawad",
  nativePlace: null,
  gotra: "Kashyap",
  contactNumber: "9123456780",
};
const relatives: RelativeFacts[] = [
  { id: "m-head", name: "Ramesh Patidar", relationship: "Head", gender: "Male", mobile: "9000000001" },
  { id: "m-wife", name: "Sunita Patidar", relationship: "Spouse", gender: "Female", mobile: "9000000002" },
  { id: "m-son", name: "Rahul Patidar", relationship: "Son", gender: "Male", mobile: "9876543210" },
];

test("gender is read from the family record, including Hindi and abbreviations", () => {
  assert.equal(genderOf("Male"), "MALE");
  assert.equal(genderOf(" female "), "FEMALE");
  assert.equal(genderOf("लड़की"), "FEMALE");
  assert.equal(genderOf("Other"), null);
  assert.equal(genderOf(null), null);
});

test("minimum ages: male 21, female 18; settings can raise but never lower them", () => {
  assert.equal(minimumAgeFor("MALE", DEFAULT_SETTINGS), 21);
  assert.equal(minimumAgeFor("FEMALE", DEFAULT_SETTINGS), 18);
  assert.equal(minimumAgeFor("FEMALE", { ...DEFAULT_SETTINGS, minimumFemaleAge: 16 }), 18);
  assert.equal(minimumAgeFor("MALE", { ...DEFAULT_SETTINGS, minimumMaleAge: 23 }), 23);
});

test("eligibility uses completed years on the birthday boundary", () => {
  assert.equal(evaluateMember(member({ dob: date("2005-11-10") }), DEFAULT_SETTINGS, TODAY).eligible, true);
  const young = evaluateMember(member({ dob: date("2005-11-11") }), DEFAULT_SETTINGS, TODAY);
  assert.deepEqual([young.eligible, young.reason, young.age], [false, "UNDERAGE", 20]);
  assert.equal(evaluateMember(member({ gender: "Female", dob: date("2008-11-10") }), DEFAULT_SETTINGS, TODAY).eligible, true);
  assert.equal(evaluateMember(member({ gender: "Female", dob: date("2008-11-11") }), DEFAULT_SETTINGS, TODAY).reason, "UNDERAGE");
});

test("members without birth date or gender, inactive members and future birth dates are not eligible", () => {
  assert.equal(evaluateMember(member({ dob: null }), DEFAULT_SETTINGS, TODAY).reason, "NO_DOB");
  assert.equal(evaluateMember(member({ gender: "Other" }), DEFAULT_SETTINGS, TODAY).reason, "NO_GENDER");
  assert.equal(evaluateMember(member({ status: "PENDING" }), DEFAULT_SETTINGS, TODAY).reason, "MEMBER_INACTIVE");
  assert.equal(evaluateMember(member({ status: "INACTIVE" }), DEFAULT_SETTINGS, TODAY).reason, "MEMBER_INACTIVE");
  assert.equal(evaluateMember(member({ status: "Active" }), DEFAULT_SETTINGS, TODAY).eligible, true);
  assert.equal(evaluateMember(member({ dob: date("2030-01-01") }), DEFAULT_SETTINGS, TODAY).reason, "NO_DOB");
});

test("a member marked MARRIED is not offered Shagun Bandhan; unmarried or not yet given still is", () => {
  const married = evaluateMember(member({ maritalStatus: "MARRIED" }), DEFAULT_SETTINGS, TODAY);
  assert.deepEqual([married.eligible, married.reason], [false, "MARRIED"]);
  assert.equal(evaluateMember(member({ maritalStatus: "UNMARRIED" }), DEFAULT_SETTINGS, TODAY).eligible, true);
  assert.equal(evaluateMember(member({ maritalStatus: null }), DEFAULT_SETTINGS, TODAY).eligible, true);
  assert.deepEqual([eligibilityError("MARRIED").getStatus(), eligibilityError("MARRIED").getResponse()], [400, { error: "SAGUN_MEMBER_MARRIED" }]);
});

test("pre-fill maps the family record and finds parents of a son", () => {
  const values = prefillFrom(member(), family, relatives);
  assert.equal(values.fullName, "Rahul Patidar");
  assert.equal(values.candidateType, "GROOM");
  assert.equal(values.dob, "2000-01-01");
  assert.equal(values.candidateMobile, undefined, "the candidate mobile is no longer collected");
  assert.equal(values.fatherName, "Ramesh Patidar");
  assert.equal(values.motherName, "Sunita Patidar");
  assert.equal(values.fatherMobile, "9000000001");
  assert.equal(values.fatherGotra, undefined, "father's gotra is no longer collected");
  assert.equal(values.gotra, "Kashyap");
  assert.equal(values.nativeVillage, "Sanawad");
  assert.equal(values.residentialAddress, "12 MG Road, Indore");
  assert.equal(values.district, "Indore");
  assert.equal(values.city, undefined, "the city is chosen in the Village/City list");
  assert.equal(values.pincode, "452001");
});

test("pre-fill for the head uses Father / Mother members and skips unknown values", () => {
  const head = member({ id: "m-head", relationship: "Head", mobile: "12345", dob: null, gender: "Other" });
  const values = prefillFrom(head, { ...family, district: "Bhopal", city: "Bhopal", pincode: "0000" }, [
    ...relatives,
    { id: "m-gf", name: "Shankar Patidar", relationship: "Father", gender: "Male", mobile: null },
  ]);
  assert.equal(values.fatherName, "Shankar Patidar");
  assert.equal(values.motherName, undefined);
  assert.equal(values.candidateMobile, undefined);
  assert.equal(values.candidateType, undefined);
  assert.equal(values.dob, undefined);
  assert.equal(values.district, undefined);
  assert.equal(values.pincode, undefined);
});

test("owner edits follow the admin settings", () => {
  assert.equal(ownerMayEdit("DRAFT", DEFAULT_SETTINGS, true), true);
  assert.equal(ownerMayEdit("UNDER_REVIEW", DEFAULT_SETTINGS, true), false);
  assert.equal(ownerMayEdit("SUBMITTED", DEFAULT_SETTINGS, true), true);
  assert.equal(ownerMayEdit("APPROVED", { ...DEFAULT_SETTINGS, allowEditAfterSubmission: false }, true), false);
  assert.equal(ownerMayEdit("REJECTED", { ...DEFAULT_SETTINGS, allowResubmission: false }, true), false);
  assert.equal(ownerMayEdit("INACTIVE", DEFAULT_SETTINGS, true), true);
  assert.equal(ownerMayEdit("INACTIVE", DEFAULT_SETTINGS, false), false);
});

test("admin review transitions", () => {
  assert.equal(reviewAllowed("SUBMITTED", "UNDER_REVIEW"), true);
  assert.equal(reviewAllowed("UNDER_REVIEW", "APPROVED"), true);
  assert.equal(reviewAllowed("DRAFT", "APPROVED"), false);
  assert.equal(reviewAllowed("REJECTED", "APPROVED"), false);
  assert.equal(reviewAllowed("APPROVED", "REJECTED"), true);
  assert.equal(reviewAllowed("INACTIVE", "INACTIVE"), false);
  assert.equal(reviewAllowed("SUBMITTED", "DRAFT"), false);
});

test("a spouse, father or mother is never offered Shagun Bandhan, even with no marital status recorded", () => {
  const settings = DEFAULT_SETTINGS;
  const adult = { gender: "Female", dob: new Date("1995-01-01"), status: "ACTIVE", maritalStatus: null };
  for (const relationship of ["Spouse", "Mother", " father ", "Daughter-in-law", "Younger Brother's Wife"]) {
    assert.deepEqual([relationship, evaluateMember({ ...adult, relationship }, settings, "2026-11-25").reason], [relationship, "MARRIED"]);
  }
  assert.equal(evaluateMember({ ...adult, relationship: "Daughter" }, settings, "2026-11-25").eligible, true);
  assert.equal(evaluateMember({ ...adult, relationship: "Daughter", maritalStatus: "MARRIED" }, settings, "2026-11-25").reason, "MARRIED");
});
