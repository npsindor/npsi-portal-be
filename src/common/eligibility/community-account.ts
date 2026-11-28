import type { Db } from "../../database/prisma.service.js";
import type { UserRow } from "../session/session.service.js";
import { LOGIN_USER_STATUSES } from "./login-account.js";

// Who a logged-in user is in the community, from the registration records (never from what the client sends):
// the owner/member of an ACTIVE family, an ACTIVE registered student, or neither. Services decide which kinds may
// use them (Sagun: family only; Travel & Assistance and room hunting: family or student).
export type CommunityKind = "ADMIN" | "FAMILY" | "STUDENT";
export interface CommunityAccount {
  kind: CommunityKind;
  familyId: string | null; // display id, e.g. NPSI-FAM-000001
  memberId: string | null;
  studentId: string | null;
  mobiles: string[]; // the account's registered mobile numbers (10 digits)
}

const ACTIVE_MEMBER = ["ACTIVE", "Active", "APPROVED"];
const digits = (value: string | null | undefined): string =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-10);

// The account's own email in the spellings older records may hold (email columns compare case-sensitively), only
// once the account has proved it owns that address.
const emailsOf = (user: UserRow): string[] =>
  user.isVerified && user.email ? [...new Set([user.email, user.email.trim(), user.email.trim().toLowerCase()])] : [];
// The account's mobile, only when it was confirmed by OTP (registration by mobile, or a verified mobile change).
const phoneOf = (user: UserRow): string | null => {
  const phone = user.phoneVerified ? digits(user.phone) : "";
  return phone.length === 10 ? phone : null;
};

// A signed-in account that belongs to a registered (admin-approved) family or student, found by the account itself, its
// verified email or its verified mobile, is a member everywhere; it is never asked to register again.
export async function communityAccount(db: Db, user: UserRow | null): Promise<CommunityAccount | null> {
  if (!user || !LOGIN_USER_STATUSES.includes(user.status)) return null;
  const emails = emailsOf(user);
  const phone = phoneOf(user);
  const owned = await db.family.findFirst({ where: { ownerUserId: user.id, status: "ACTIVE" }, select: { familyId: true, contactNumber: true } });
  const byContact =
    !owned && (emails.length || phone)
      ? await db.family.findFirst({
          where: { status: "ACTIVE", OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(phone ? [{ contactDigits: phone }] : [])] },
          select: { familyId: true, contactNumber: true },
          orderBy: { id: "asc" },
        })
      : null;
  const family = owned || byContact;
  // Administrators are never linked to a family through a member record.
  const member =
    (emails.length || phone) && user.role !== "admin"
      ? await db.familyMember.findFirst({
          where: {
            status: { in: ACTIVE_MEMBER },
            family: { status: "ACTIVE" },
            OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(phone ? [{ mobileDigits: phone }] : [])],
          },
          select: { id: true, familyId: true, mobile: true },
          orderBy: { id: "asc" },
        })
      : null;
  const mobiles = (extra: (string | null | undefined)[]) => [...new Set([user.phone, ...extra].map(digits).filter((value) => value.length === 10))];
  if (family || member)
    return {
      kind: user.role === "admin" ? "ADMIN" : "FAMILY",
      familyId: family?.familyId ?? member?.familyId ?? null,
      memberId: member?.id ?? null,
      studentId: null,
      mobiles: mobiles([family?.contactNumber, member?.mobile]),
    };
  // A student approved from the public form has no user id on the record; their login is found by its email.
  const student = await db.student.findFirst({
    where: { OR: [{ userId: user.id }, ...(emails.length ? [{ email: { in: emails } }] : []), ...(phone ? [{ mobileDigits: phone }] : [])], status: "ACTIVE" },
    select: { studentId: true, mobile: true },
  });
  if (student)
    return {
      kind: user.role === "admin" ? "ADMIN" : "STUDENT",
      familyId: null,
      memberId: null,
      studentId: student.studentId,
      mobiles: mobiles([student.mobile]),
    };
  if (user.role === "admin") return { kind: "ADMIN", familyId: null, memberId: null, studentId: null, mobiles: mobiles([]) };
  return null;
}
