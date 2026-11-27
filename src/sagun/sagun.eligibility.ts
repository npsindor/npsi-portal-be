import { ApiError } from "../common/filters/api-error.js";
import { ageOf } from "./sagun.rules.js";

// Application workflow. A member has at most one Sagun profile (unique member_id); later changes reuse that row.
export const SAGUN_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "INACTIVE"] as const;
export type SagunStatus = (typeof SAGUN_STATUSES)[number];
export const REVIEW_STATUSES = ["UNDER_REVIEW", "APPROVED", "REJECTED", "INACTIVE"] as const;

// Legal floor (Prohibition of Child Marriage Act, 2006). Admin settings may raise these, never lower them.
export const LEGAL_MINIMUM_AGE = { MALE: 21, FEMALE: 18 } as const;

export interface SagunSettingsValues {
  minimumFemaleAge: number;
  minimumMaleAge: number;
  registrationEnabled: boolean;
  profileVisibility: string;
  approvalRequired: boolean;
  allowEditAfterSubmission: boolean;
  allowResubmission: boolean;
}
export const DEFAULT_SETTINGS: SagunSettingsValues = {
  minimumFemaleAge: LEGAL_MINIMUM_AGE.FEMALE,
  minimumMaleAge: LEGAL_MINIMUM_AGE.MALE,
  registrationEnabled: true,
  profileVisibility: "MEMBERS",
  approvalRequired: true,
  allowEditAfterSubmission: true,
  allowResubmission: true,
};

export type Gender = "MALE" | "FEMALE";
// Family registration stores "Male" / "Female" / "Other"; older imports may hold Hindi or abbreviations.
export const genderOf = (value: string | null | undefined): Gender | null => {
  const text = (value || "").trim().toLowerCase();
  if (["male", "m", "boy", "पुरुष", "लड़का", "पु"].includes(text)) return "MALE";
  if (["female", "f", "girl", "महिला", "स्त्री", "लड़की", "म"].includes(text)) return "FEMALE";
  return null;
};
export const candidateTypeOf = (gender: Gender): "GROOM" | "BRIDE" => (gender === "MALE" ? "GROOM" : "BRIDE");
export const minimumAgeFor = (gender: Gender, settings: SagunSettingsValues): number =>
  gender === "MALE" ? Math.max(LEGAL_MINIMUM_AGE.MALE, settings.minimumMaleAge) : Math.max(LEGAL_MINIMUM_AGE.FEMALE, settings.minimumFemaleAge);

export const memberIsActive = (status: string | null | undefined): boolean => ["ACTIVE", "APPROVED"].includes((status || "").trim().toUpperCase());
export const isoDate = (value: Date | null | undefined): string | null => (value ? value.toISOString().slice(0, 10) : null);

export type IneligibleReason = "MEMBER_INACTIVE" | "MARRIED" | "NO_DOB" | "NO_GENDER" | "UNDERAGE";
export interface MemberFacts {
  gender: string | null;
  dob: Date | null;
  status: string | null;
  // Shagun Bandhan is for unmarried members; a member the family marked MARRIED is not offered it.
  maritalStatus?: string | null;
  // A spouse (and the head's father or mother) is married by the relationship itself, whatever the status field says.
  relationship?: string | null;
}
const MARRIED_RELATIONSHIPS = ["spouse", "wife", "husband", "father", "mother", "daughter-in-law", "younger brother's wife"];
export const isMarried = (member: Pick<MemberFacts, "maritalStatus" | "relationship">): boolean =>
  (member.maritalStatus || "").trim().toUpperCase() === "MARRIED" || MARRIED_RELATIONSHIPS.includes((member.relationship || "").trim().toLowerCase());
export interface Eligibility {
  eligible: boolean;
  reason: IneligibleReason | null;
  gender: Gender | null;
  age: number | null;
  minimumAge: number | null;
}
// Eligibility comes only from the family registration record, never from what the client sends.
export const evaluateMember = (member: MemberFacts, settings: SagunSettingsValues, today?: string): Eligibility => {
  const gender = genderOf(member.gender);
  const dob = isoDate(member.dob);
  const age = dob ? ageOf(dob, today) : null;
  const minimumAge = gender ? minimumAgeFor(gender, settings) : null;
  const reason: IneligibleReason | null = !memberIsActive(member.status)
    ? "MEMBER_INACTIVE"
    : isMarried(member)
      ? "MARRIED"
      : !dob || age === null || age < 0
        ? "NO_DOB"
        : !gender || minimumAge === null
          ? "NO_GENDER"
          : age < minimumAge
            ? "UNDERAGE"
            : null;
  return { eligible: reason === null, reason, gender, age, minimumAge };
};
export const eligibilityError = (reason: IneligibleReason): ApiError =>
  reason === "UNDERAGE"
    ? new ApiError(400, "SAGUN_ELIGIBILITY")
    : reason === "MEMBER_INACTIVE"
      ? new ApiError(403, "SAGUN_MEMBER_INACTIVE")
      : reason === "MARRIED"
        ? new ApiError(400, "SAGUN_MEMBER_MARRIED")
        : new ApiError(400, "SAGUN_MEMBER_DATA_INCOMPLETE");

// What the member's owner may do with an existing profile, given the admin settings.
// `inactivatedByOwner` is false when an admin set the profile INACTIVE: only an admin may reopen it.
export const ownerMayEdit = (status: string, settings: SagunSettingsValues, inactivatedByOwner: boolean): boolean => {
  if (status === "DRAFT") return true;
  if (status === "UNDER_REVIEW") return false;
  if (status === "SUBMITTED" || status === "APPROVED") return settings.allowEditAfterSubmission;
  if (status === "REJECTED") return settings.allowResubmission;
  if (status === "INACTIVE") return inactivatedByOwner;
  return false;
};

// Allowed admin review transitions.
const REVIEW_FROM: Record<(typeof REVIEW_STATUSES)[number], string[]> = {
  UNDER_REVIEW: ["SUBMITTED"],
  APPROVED: ["SUBMITTED", "UNDER_REVIEW"],
  REJECTED: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"],
  INACTIVE: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"],
};
export const reviewAllowed = (from: string, to: string): boolean => (REVIEW_FROM as Record<string, string[]>)[to]?.includes(from) ?? false;

export interface FamilyFacts {
  familyId: string | null;
  headName: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  pincode: string | null;
  village: string | null;
  nativePlace: string | null;
  gotra: string | null;
  contactNumber: string | null;
}
export interface RelativeFacts {
  id: string;
  name: string;
  relationship: string;
  gender: string | null;
  mobile: string | null;
}
export interface MemberRecord extends MemberFacts {
  id: string;
  membershipId: string | null;
  name: string;
  relationship: string;
  mobile: string | null;
  email: string | null;
  education: string | null;
  occupation: string | null;
  address: string | null;
}

const mobile10 = (value: string | null | undefined): string | undefined => {
  const digits = (value || "").replace(/\D/g, "").slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : undefined;
};
const clip = (value: string | null | undefined, max: number): string | undefined => {
  const text = (value || "").trim();
  return text ? text.slice(0, max) : undefined;
};
const rel = (value: string) => value.trim().toLowerCase();

// The candidate's parents, from relationships recorded relative to the family head.
export const parentsOf = (member: MemberRecord, relatives: RelativeFacts[], family: FamilyFacts) => {
  const by = (relationship: string, gender?: Gender) =>
    relatives.find((row) => row.id !== member.id && rel(row.relationship) === relationship && (!gender || genderOf(row.gender) === gender));
  const relationship = rel(member.relationship);
  if (["son", "daughter"].includes(relationship)) {
    const head = by("head") ?? by("self");
    const spouse = by("spouse") ?? by("wife") ?? by("husband");
    const parents = [head, spouse].filter((row): row is RelativeFacts => !!row);
    const father = parents.find((row) => genderOf(row.gender) === "MALE");
    const mother = parents.find((row) => genderOf(row.gender) === "FEMALE");
    return {
      fatherName: father?.name ?? (head ? undefined : clip(family.headName, 200)),
      motherName: mother?.name,
      parentMobile: mobile10(father?.mobile) ?? mobile10(mother?.mobile) ?? mobile10(family.contactNumber),
    };
  }
  if (["head", "self", "brother", "sister"].includes(relationship)) {
    const father = by("father");
    const mother = by("mother");
    return { fatherName: father?.name, motherName: mother?.name, parentMobile: mobile10(father?.mobile) ?? mobile10(mother?.mobile) };
  }
  return { fatherName: undefined, motherName: undefined, parentMobile: undefined };
};

// Form values pre-filled from the family registration. dob and candidateType are authoritative (locked);
// the rest are suggestions the applicant can correct before submission.
export const prefillFrom = (member: MemberRecord, family: FamilyFacts, relatives: RelativeFacts[]): Record<string, string> => {
  const gender = genderOf(member.gender);
  const parents = parentsOf(member, relatives, family);
  const district = ["Indore", "Khargone"].find((name) =>
    [family.district, family.city].some((value) => (value || "").trim().toLowerCase() === name.toLowerCase()),
  );
  const pincode = (family.pincode || "").trim();
  const values: Record<string, string | undefined> = {
    fullName: clip(member.name, 150),
    candidateType: gender ? candidateTypeOf(gender) : undefined,
    dob: isoDate(member.dob) ?? undefined,
    education: clip(member.education, 200),
    occupation: clip(member.occupation, 200),
    residentialAddress: clip(member.address || family.address, 1500),
    familyAddress: clip(family.address, 1500),
    nativeVillage: clip(family.village || family.nativePlace, 200),
    gotra: clip(family.gotra, 200),
    fatherName: clip(parents.fatherName, 200),
    motherName: clip(parents.motherName, 200),
    fatherMobile: parents.parentMobile,
    pincode: /^[1-9]\d{5}$/.test(pincode) ? pincode : undefined,
    district,
    state: district ? "Madhya Pradesh" : undefined,
    country: "India",
  };
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
};

export const LOCKED_KEYS = ["dob", "candidateType"] as const;
