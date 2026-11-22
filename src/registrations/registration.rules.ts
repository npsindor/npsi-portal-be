import { ApiError } from "../common/filters/api-error.js";
import { indiaDate } from "../common/validation/fields.js";

export const REGISTRATION_TYPES = ["FAMILY", "STUDENT"] as const;
export type RegistrationType = (typeof REGISTRATION_TYPES)[number];
export const FEES: Record<RegistrationType, number> = { FAMILY: 500, STUDENT: 100 };
export const FEE_TYPES: Record<RegistrationType, string> = { FAMILY: "Family Registration", STUDENT: "Student Registration" };
export const CITIES = ["Indore", "Ujjain", "Dewas", "Other"] as const;
export const GENDERS = ["Male", "Female", "Other"] as const;
export const PAYMENT_DECISIONS = ["VERIFIED", "REJECTED", "REFUND_REQUESTED", "REFUND_PROCESSING", "REFUNDED", "REFUND_REJECTED"] as const;
export type PaymentDecision = (typeof PAYMENT_DECISIONS)[number];

// Registration-fee payments the admin has accepted. SUCCESS is the older status for a settled payment.
export const PAID = ["VERIFIED", "SUCCESS"];

// Which payment decisions are allowed from which status.
const FROM: Record<PaymentDecision, string[]> = {
  VERIFIED: ["PENDING", "SUBMITTED", "REJECTED"],
  REJECTED: ["PENDING", "SUBMITTED", "VERIFIED"],
  REFUND_REQUESTED: ["VERIFIED", "SUCCESS"],
  REFUND_PROCESSING: ["REFUND_REQUESTED"],
  REFUNDED: ["REFUND_REQUESTED", "REFUND_PROCESSING"],
  REFUND_REJECTED: ["REFUND_REQUESTED", "REFUND_PROCESSING"],
};
export const paymentDecisionAllowed = (from: string | null, decision: PaymentDecision): boolean => FROM[decision].includes(from || "PENDING");

// An application can be approved only once its fee is paid; applications with no fee record (admin-entered,
// or older free student registrations) are not held back.
export const assertFeeSettled = (status: string | null | undefined): void => {
  if (status !== undefined && !PAID.includes(status || "")) throw new ApiError(409, "Verify the registration payment before approving this application.");
};

// The applicant may change and resubmit while the admin asks for a correction or rejected the payment.
export const canResubmit = (applicationStatus: string | null, paymentStatus: string | null | undefined): boolean =>
  !["APPROVED", "REJECTED"].includes(applicationStatus || "") && (applicationStatus === "CORRECTION_REQUIRED" || paymentStatus === "REJECTED");

export const isoDateOnly = (value: Date | null | undefined): string | null => (value ? value.toISOString().slice(0, 10) : null);

// Date-of-birth rules: a real past date (never today or later, at most 120 years ago), and a minimum age
// per registration (the member who registers a family is an adult; a student registers after 12th, at 18 or older).
export const MIN_AGE: Record<RegistrationType, number> = { FAMILY: 18, STUDENT: 18 };
export const MAX_AGE = 120;
export const DOB_ERRORS = {
  invalid: "A valid date of birth is required.",
  notPast: "Date of birth must be before today.",
  tooOld: "Please enter a real date of birth.",
  FAMILY: "The registering member must be at least 18 years old.",
  STUDENT: "The student must be at least 18 years old.",
} as const;
const yearsBefore = (date: string, years: number): string => `${String(Number(date.slice(0, 4)) - years).padStart(4, "0")}${date.slice(4)}`;
// `today` is YYYY-MM-DD (UTC); returns the error message, or null when the date is acceptable.
export const birthDateError = (value: string, type: RegistrationType, today = indiaDate()): string | null => {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return DOB_ERRORS.invalid;
  if (value >= today) return DOB_ERRORS.notPast;
  if (value < yearsBefore(today, MAX_AGE)) return DOB_ERRORS.tooOld;
  if (value > yearsBefore(today, MIN_AGE[type])) return DOB_ERRORS[type];
  return null;
};

// Student registration needs where the student lives in Indore (district Indore); a student from another district
// (Khargone, say) enters their local Indore address, and their home village under Native village.
export const STUDENT_CITY = "Indore";
export const STUDENT_INDORE_ERROR = "Student registration needs your local address in Indore (district Indore).";
export const SCHOOL_CLASS_ERROR = "Student registration is for courses after 12th.";
// LKG, UKG, 1st–12th, "class 10", nursery: school classes, not a course for a student registration (18+, after 12th).
export const isSchoolClass = (value: string | null | undefined): boolean =>
  /^\s*(nursery|lkg|ukg|(class\s*)?\d{1,2}\s*(st|nd|rd|th)?(\b|\s|$)|class\s*\d)/i.test(value ?? "");

export interface CompletionInput {
  // The account has a mobile number proven with a code sent to it (an admin without a mobile has not);
  // null leaves the step out (no WhatsApp / SMS provider, so it could never be done).
  mobileVerified?: boolean | null;
  hasEmail: boolean;
  hasPhoto: boolean;
  registration: { status: string | null; paymentStatus: string | null } | null;
  approved: boolean;
  familyMembers: number | null; // null: not a family account
  headDetails: boolean; // education and occupation filled for the head / student
}
export interface CompletionStep {
  key: string;
  done: boolean;
  weight: number;
  link: string;
}

// "Your profile is 60% complete": what's done and what to do next, in the order a member should do it.
export const profileCompletion = (input: CompletionInput): { percent: number; steps: CompletionStep[]; next: CompletionStep | null } => {
  const registered = Boolean(input.registration && input.registration.status !== "REJECTED");
  const steps: CompletionStep[] = [
    ...(input.mobileVerified === null ? [] : [{ key: "mobileVerified", done: input.mobileVerified ?? true, weight: 10, link: "/portal/settings#mobile" }]),
    { key: "registrationSubmitted", done: registered || input.approved, weight: 25, link: "/portal/registration" },
    { key: "paymentVerified", done: input.approved || PAID.includes(input.registration?.paymentStatus || ""), weight: 15, link: "/portal/registration" },
    { key: "approved", done: input.approved, weight: 15, link: "/portal/registration" },
    { key: "email", done: input.hasEmail, weight: 10, link: "/portal/settings" },
    { key: "photo", done: input.hasPhoto, weight: 10, link: "/portal/settings" },
    { key: "details", done: input.headDetails, weight: 10, link: input.familyMembers === null ? "/portal" : "/portal/family" },
    ...(input.familyMembers === null ? [] : [{ key: "familyMembers", done: input.familyMembers > 1, weight: 5, link: "/portal/family" }]),
  ];
  const total = steps.reduce((sum, step) => sum + step.weight, 0);
  const done = steps.reduce((sum, step) => sum + (step.done ? step.weight : 0), 0);
  return { percent: Math.round((done / total) * 100), steps, next: steps.find((step) => !step.done) ?? null };
};
