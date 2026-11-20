import type { Db } from "../../database/prisma.service.js";
import type { UserRow } from "../session/session.service.js";

// Who a logged-in user is in the community, from the registration records (never from what the client sends):
// the owner/member of an ACTIVE family, an ACTIVE registered student, or neither. Services decide which kinds may
// use them (Sagun: family only; transportation and room hunting: family or student).
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

export async function communityAccount(db: Db, user: UserRow | null): Promise<CommunityAccount | null> {
  if (!user || user.status !== "active" || !user.isVerified) return null;
  const owned = await db.family.findFirst({ where: { ownerUserId: user.id, status: "ACTIVE" }, select: { familyId: true, contactNumber: true } });
  const byEmail =
    !owned && user.email
      ? await db.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { familyId: true, contactNumber: true } })
      : null;
  const family = owned || byEmail;
  // Administrators are never linked to a family through a member record.
  const member =
    user.email && user.role !== "admin"
      ? await db.familyMember.findFirst({
          where: { email: user.email, status: { in: ACTIVE_MEMBER }, family: { status: "ACTIVE" } },
          select: { id: true, familyId: true, mobile: true },
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
  const student = await db.student.findFirst({ where: { userId: user.id, status: "ACTIVE" }, select: { studentId: true, mobile: true } });
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
