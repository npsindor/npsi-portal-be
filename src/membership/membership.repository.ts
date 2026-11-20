import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

const ACTIVE_MEMBER = ["ACTIVE", "Active", "APPROVED"];

// Which family a user belongs to, and who its members are: the questions several
// modules ask before letting a member act on a record.
@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The family (display id) a user belongs to: an ACTIVE family registered
  // with their email, else the family of an ACTIVE (admin-approved) member with their email. A member a head
  // added on their own is PENDING and links nobody; an administrator is never linked through a member record.
  async ownFamilyId(user: UserRow | null): Promise<string | null> {
    if (!user) return null;
    // Families approved from an account-first registration are owned by that account.
    const owned = await this.prisma.family.findFirst({ where: { ownerUserId: user.id, status: "ACTIVE" }, select: { familyId: true } });
    if (owned?.familyId) return owned.familyId;
    if (!user.email) return null;
    const family = await this.prisma.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { familyId: true } });
    if (family?.familyId) return family.familyId;
    if (user.role === "admin") return null;
    const member = await this.prisma.familyMember.findFirst({
      where: { email: user.email, status: { in: ACTIVE_MEMBER }, family: { status: "ACTIVE" } },
      select: { familyId: true },
    });
    return member ? member.familyId : null;
  }

  // The family a membership id (NPSI-MEM-…) belongs to.
  async familyIdOfMembership(membershipId: string): Promise<string | null> {
    const member = await this.prisma.familyMember.findFirst({ where: { membershipId }, select: { familyId: true } });
    return member?.familyId ?? null;
  }

  async memberIdsOfFamily(familyId: string): Promise<string[]> {
    return (await this.prisma.familyMember.findMany({ where: { familyId }, select: { id: true } })).map((member) => member.id);
  }

  // Who a student record (NPSI-STU-…) belongs to: its email and linked family.
  studentOwner(studentId: string): Promise<{ email: string | null; linkedFamilyId: string | null } | null> {
    return this.prisma.student.findFirst({ where: { studentId }, select: { email: true, linkedFamilyId: true } });
  }
}
