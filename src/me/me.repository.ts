import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { EventRegistration, Family, FamilyMember, Feedback, Student } from "../generated/prisma/client.js";

// Reads behind "my family", "my feedback" and "my event registrations". Email matches are
// case-insensitive through the column collation.
@Injectable()
export class MeRepository {
  constructor(private readonly prisma: PrismaService) {}

  activeFamilyOwnedBy(userId: string): Promise<Family | null> {
    return this.prisma.family.findFirst({ where: { ownerUserId: userId, status: "ACTIVE" } });
  }

  studentOwnedBy(userId: string): Promise<Student | null> {
    return this.prisma.student.findFirst({ where: { userId, AND: [{ status: { not: "TRANSFERRED" } }, { status: { not: null } }] } });
  }

  activeFamilyByEmail(email: string): Promise<Family | null> {
    return this.prisma.family.findFirst({ where: { email, status: "ACTIVE" } });
  }

  // Only an admin-approved (ACTIVE) member links an account to a family; a member a head added on their own is PENDING.
  async memberFamilyIdByEmail(email: string): Promise<string | null> {
    const member = await this.prisma.familyMember.findFirst({ where: { email, status: { in: ["ACTIVE", "Active", "APPROVED"] } }, select: { familyId: true } });
    return member?.familyId ?? null;
  }

  familyByFamilyId(familyId: string): Promise<Family | null> {
    return this.prisma.family.findFirst({ where: { familyId } });
  }

  membersOfFamily(familyId: string): Promise<FamilyMember[]> {
    return this.prisma.familyMember.findMany({ where: { familyId }, orderBy: { createdAt: "asc" } });
  }

  // A student record that hasn't been transferred away (a NULL status doesn't count either).
  studentByEmail(email: string): Promise<Student | null> {
    return this.prisma.student.findFirst({ where: { email, AND: [{ status: { not: "TRANSFERRED" } }, { status: { not: null } }] } });
  }

  openTransferRequestsBy(requesterId: string) {
    return this.prisma.transferRequest.findMany({
      where: { requesterId, status: { in: ["PENDING", "CORRECTION_REQUIRED"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { requestId: true, requestType: true, status: true, sourceMembershipId: true, sourceStudentId: true, targetFamilyId: true, createdAt: true },
    });
  }

  feedbackByEmail(email: string): Promise<Feedback[]> {
    return this.prisma.feedback.findMany({ where: { email }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  eventRegistrationsOfFamily(familyId: string): Promise<EventRegistration[]> {
    return this.prisma.eventRegistration.findMany({ where: { familyId }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  }
}
