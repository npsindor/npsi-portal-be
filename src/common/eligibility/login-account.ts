import type { Db } from "../../database/prisma.service.js";
import { ApiError } from "../filters/api-error.js";
import type { UserRow } from "../session/session.service.js";

// Which login portal an account belongs to, decided only from the registration records in the database (never from
// anything the browser sends). There is one `users` row per login; a login is a Family Member account when a family
// or a family registration is attached to it (owner, or the family/member email), and a Student account when a student
// record or student registration is attached to it (its user id or email). A student record that moved into a family
// (TRANSFERRED) no longer counts: that person now uses the family portal.
export type LoginPortal = "FAMILY" | "STUDENT";
export type AccountType = "ADMIN" | "FAMILY" | "STUDENT" | "NONE";
export type AccountStatus = "ACTIVE" | "PENDING" | "CORRECTION_REQUIRED" | "REJECTED" | "SUSPENDED" | "INACTIVE" | "NONE";
export interface LoginAccount {
  type: AccountType;
  status: AccountStatus;
  familyId: string | null;
  studentId: string | null;
  // Both an approved family and an approved student record point at this one login (legacy data). The account is
  // restricted to the Family Member portal until the Sangathan decides otherwise; see scripts/duplicate-report.mjs.
  dual: boolean;
}

export const LOGIN_PORTALS = ["FAMILY", "STUDENT"] as const;
// User account states that may hold a session. Anything else (suspended, disabled, …) is locked out.
export const LOGIN_USER_STATUSES = ["active", "invited"];

export const USE_FAMILY_LOGIN = "Your account is registered as an NPS Family Member. Please use Family Member Login to access your account.";
export const USE_STUDENT_LOGIN = "Your account is registered as an NPS Student. Please use Student Login to access your account.";
export const ADMIN_USE_MEMBER_LOGIN = "Administrator accounts sign in through Family Member Login.";
export const ACCOUNT_DISABLED = "This account is not active. Please contact the NPS Indore office.";
export const FAMILY_SUSPENDED = "Your NPS family membership is suspended. Please contact the NPS Indore office.";
export const FAMILY_INACTIVE = "Your NPS family membership is inactive. Please contact the NPS Indore office.";
export const STUDENT_INACTIVE = "Your NPS student registration is inactive. Please contact the NPS Indore office.";

// Higher wins when one login has several records of the same kind (e.g. a rejected and a new application).
const RANK: Record<AccountStatus, number> = { ACTIVE: 4, PENDING: 3, CORRECTION_REQUIRED: 3, SUSPENDED: 2, INACTIVE: 2, REJECTED: 1, NONE: 0 };
const best = (statuses: AccountStatus[]): AccountStatus => statuses.reduce<AccountStatus>((top, next) => (RANK[next] > RANK[top] ? next : top), "NONE");

const familyStatus = (status: string | null | undefined): AccountStatus => {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE" || value === "APPROVED") return "ACTIVE";
  if (value === "SUSPENDED") return "SUSPENDED";
  if (value === "DEACTIVATED" || value === "INACTIVE") return "INACTIVE";
  return "PENDING";
};
const studentStatus = (status: string | null | undefined): AccountStatus => {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "ACTIVE";
  if (value === "INACTIVE" || value === "SUSPENDED") return value;
  return "PENDING";
};
// Registration applications: APPROVED ones are represented by the family/student record they created.
const applicationStatus = (status: string | null | undefined): AccountStatus | null => {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return null;
  if (value === "REJECTED") return "REJECTED";
  if (value === "CORRECTION_REQUIRED") return "CORRECTION_REQUIRED";
  return "PENDING";
};

export async function loginAccount(db: Db, user: UserRow): Promise<LoginAccount> {
  const email = user.email?.trim() || null;
  const byEmail = <T>(clause: T) => (email ? [clause] : []);
  const [families, members, applications, students, studentApplications] = await Promise.all([
    db.family.findMany({ where: { OR: [{ ownerUserId: user.id }, ...byEmail({ email })] }, select: { familyId: true, status: true } }),
    // Only members an admin approved (ACTIVE) speak for an account: a member a head added on their own (PENDING) must not
    // change another person's account, and administrators are never tied to a family through a member record.
    email && user.role !== "admin"
      ? db.familyMember.findMany({
          where: { email, status: { in: ["ACTIVE", "Active", "APPROVED"] } },
          select: { familyId: true, status: true, family: { select: { status: true } } },
        })
      : [],
    db.application.findMany({ where: { OR: [{ userId: user.id }, ...byEmail({ email })] }, select: { status: true } }),
    db.student.findMany({
      where: { OR: [{ userId: user.id }, ...byEmail({ email })], NOT: { status: "TRANSFERRED" } },
      select: { studentId: true, status: true },
    }),
    db.studentApplication.findMany({ where: { OR: [{ userId: user.id }, ...byEmail({ email })] }, select: { status: true } }),
  ]);
  const familyRecords = [
    ...families.map((row) => ({ familyId: row.familyId, status: familyStatus(row.status) })),
    // A member counts as active only while both the member and the family are.
    ...members.map((row) => ({
      familyId: row.familyId,
      status: familyStatus(row.status) === "ACTIVE" ? familyStatus(row.family?.status) : familyStatus(row.status),
    })),
  ];
  const family = best([...familyRecords.map((row) => row.status), ...applications.map((row) => applicationStatus(row.status)).filter((s) => s !== null)]);
  const studentRecords = students.map((row) => ({ studentId: row.studentId, status: studentStatus(row.status) }));
  const student = best([
    ...studentRecords.map((row) => row.status),
    ...studentApplications.map((row) => applicationStatus(row.status)).filter((s) => s !== null),
  ]);
  const familyId = familyRecords.find((row) => row.status === family)?.familyId ?? familyRecords[0]?.familyId ?? null;
  const studentId = studentRecords.find((row) => row.status === student)?.studentId ?? studentRecords[0]?.studentId ?? null;
  const dual = family === "ACTIVE" && student === "ACTIVE";
  if (user.role === "admin") return { type: "ADMIN", status: "ACTIVE", familyId, studentId, dual };
  if (family === "NONE" && student === "NONE") return { type: "NONE", status: "NONE", familyId: null, studentId: null, dual: false };
  // The stronger registration decides (an approved student who has only applied for a family is still a student until
  // that family is approved); a tie goes to the family, matching communityAccount().
  if (RANK[student] > RANK[family]) return { type: "STUDENT", status: student, familyId: null, studentId, dual };
  return { type: "FAMILY", status: family, familyId, studentId: null, dual };
}

// The login rules, for both password and email-code sign-in. Wrong passwords never reach this (generic 401 first).
// A new account with no registration yet may use either portal: the portal decides which registration it starts.
// Pending, correction and rejected registrations may sign in to see their status; the restricted features check
// for an ACTIVE family/student themselves (communityAccount, ownFamilyId).
export function assertLoginPortal(user: UserRow, account: LoginAccount, portal: LoginPortal): void {
  if (!LOGIN_USER_STATUSES.includes(user.status)) throw new ApiError(403, ACCOUNT_DISABLED);
  if (account.type === "ADMIN") {
    if (portal !== "FAMILY") throw new ApiError(403, ADMIN_USE_MEMBER_LOGIN);
    return;
  }
  if (account.type === "FAMILY" && portal !== "FAMILY") throw new ApiError(403, USE_FAMILY_LOGIN);
  if (account.type === "STUDENT" && portal !== "STUDENT") throw new ApiError(403, USE_STUDENT_LOGIN);
  if (account.type === "FAMILY" && account.status === "SUSPENDED") throw new ApiError(403, FAMILY_SUSPENDED);
  if (account.type === "FAMILY" && account.status === "INACTIVE") throw new ApiError(403, FAMILY_INACTIVE);
  if (account.type === "STUDENT" && (account.status === "INACTIVE" || account.status === "SUSPENDED")) throw new ApiError(403, STUDENT_INACTIVE);
}

export const asPortal = (value: unknown): LoginPortal => (String(value || "").toUpperCase() === "STUDENT" ? "STUDENT" : "FAMILY");

// The login account (if any) that already uses this email, and what it is.
export async function loginAccountForEmail(db: Db, email: string | null | undefined): Promise<LoginAccount | null> {
  const target = String(email || "")
    .trim()
    .toLowerCase();
  if (!target) return null;
  const user = await db.user.findFirst({ where: { email: target } });
  return user ? loginAccount(db, user) : null;
}

// A student record must not be attached to a Family Member (or admin) login: the student would then sign in through
// the family portal and the family login would gain a student. A rejected family registration does not bind the login.
export const bindsToFamily = (account: LoginAccount | null): boolean =>
  Boolean(account && (account.type === "ADMIN" || (account.type === "FAMILY" && account.status !== "REJECTED")));

export const FAMILY_ACCOUNT_STUDENT_REGISTRATION =
  "Your account is registered as an NPS Family Member. A student needs their own account: use Student Login with the student's own email or mobile.";
export const STUDENT_EMAIL_IS_FAMILY_LOGIN =
  "This email is already the login of an NPS Family Member account. Enter the student's own email so they get a separate Student Login.";
export const APPROVAL_EMAIL_IS_FAMILY_LOGIN =
  "This student's email is the login of an existing Family Member account, so approving would attach the student to that login. Ask for a correction with the student's own email.";
