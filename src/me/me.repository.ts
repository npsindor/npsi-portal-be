import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Family, FamilyMember, Feedback, Student } from "../generated/prisma/client.js";

// Reads behind "my family" and "my feedback". Email matches are
// case-insensitive through the column collation.
@Injectable()
export class MeRepository {
  constructor(private readonly prisma: PrismaService) {}

  activeFamilyByEmail(email: string): Promise<Family | null> {
    return this.prisma.family.findFirst({ where: { email, status: "ACTIVE" } });
  }

  async memberFamilyIdByEmail(email: string): Promise<string | null> {
    return (await this.prisma.familyMember.findFirst({ where: { email }, select: { familyId: true } }))?.familyId ?? null;
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

  feedbackByEmail(email: string): Promise<Feedback[]> {
    return this.prisma.feedback.findMany({ where: { email }, orderBy: { createdAt: "desc" }, take: 100 });
  }
}
