import { Injectable } from "@nestjs/common";
import type { UserRow } from "../common/session/session.service.js";
import { PrismaService } from "../database/prisma.service.js";

// How long after a form is submitted its follow-up writes (fee, "submitted"
// notification, transfer notice) are accepted from a non-admin.
const RECENT_MINUTES = 15;
const recentCutoff = (): Date => new Date(Date.now() - RECENT_MINUTES * 60_000);

export type ApplicationKind = "Application" | "StudentApplication";

// Which family a user belongs to and what they just submitted: the questions
// several modules ask before letting a member act on a record.
@Injectable()
export class MembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  // The family (display id) a user belongs to: an ACTIVE family registered
  // with their email, else the family of a member with their email.
  async ownFamilyId(user: UserRow | null): Promise<string | null> {
    if (!user?.email) return null;
    const family = await this.prisma.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { familyId: true } });
    if (family?.familyId) return family.familyId;
    const member = await this.prisma.familyMember.findFirst({ where: { email: user.email }, select: { familyId: true } });
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

  // The kind of application submitted with this display id in the last RECENT_MINUTES, if any.
  async recentApplicationKind(applicationId: string | null | undefined): Promise<ApplicationKind | null> {
    if (!applicationId) return null;
    const where = { applicationId, createdAt: { gt: recentCutoff() } };
    if (await this.prisma.application.count({ where })) return "Application";
    if (await this.prisma.studentApplication.count({ where })) return "StudentApplication";
    return null;
  }

  // Whether this user requested a transfer to that family in the last RECENT_MINUTES.
  async recentTransferTo(userId: string, targetFamilyId: string): Promise<boolean> {
    return (await this.prisma.transferRequest.count({ where: { requesterId: userId, targetFamilyId, createdAt: { gt: recentCutoff() } } })) > 0;
  }
}
