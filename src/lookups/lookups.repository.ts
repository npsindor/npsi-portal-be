import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Application } from "../generated/prisma/client.js";

// Rejected applications don't hold on to their mobile/email (a NULL status still does).
const NOT_REJECTED = { OR: [{ status: null }, { status: { not: "REJECTED" } }] };
const notId = (id?: string) => (id === undefined ? {} : { id: { not: id } });

export interface PublicFamily {
  familyId: string | null;
  familyName: string | null;
  headName: string | null;
  status: string | null;
  city: string | null;
  registrationDate: Date | null;
}

export interface PublicMember {
  name: string;
  relationship: string;
  gender: string | null;
  status: string | null;
}

// Reads behind the public lookups and the duplicate-contact checks.
@Injectable()
export class LookupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  publicFamily(familyId: string): Promise<PublicFamily | null> {
    return this.prisma.family.findFirst({
      where: { familyId },
      select: { familyId: true, familyName: true, headName: true, status: true, city: true, registrationDate: true },
    });
  }

  publicMembers(familyId: string): Promise<PublicMember[]> {
    return this.prisma.familyMember.findMany({
      where: { familyId },
      select: { name: true, relationship: true, gender: true, status: true },
      orderBy: { createdAt: "asc" },
    });
  }

  application(applicationId: string, mobile: string): Promise<Application | null> {
    return this.prisma.application.findFirst({ where: { applicationId, mobile } });
  }

  async activeCounts(): Promise<{ families: number; members: number }> {
    const [families, members] = await Promise.all([
      this.prisma.family.count({ where: { status: "ACTIVE" } }),
      this.prisma.familyMember.count({ where: { status: "ACTIVE" } }),
    ]);
    return { families, members };
  }

  // Duplicate-contact checks on the stored digits (last 10 of the mobile, kept
  // by the repositories) and trimmed emails (matched case-insensitively by the
  // column collation). Rejected applications never count; a NULL status does.

  // Public "is this mobile free?" check (all five contact sources).
  async mobileUsedAnywhere(target: string): Promise<boolean> {
    return this.any([
      this.prisma.application.count({ where: { mobileDigits: target, ...NOT_REJECTED } }),
      this.prisma.family.count({ where: { contactDigits: target } }),
      this.prisma.familyMember.count({ where: { mobileDigits: target } }),
      this.prisma.studentApplication.count({ where: { mobileDigits: target, ...NOT_REJECTED } }),
      this.prisma.student.count({ where: { mobileDigits: target } }),
    ]);
  }

  // Mobile already claimed, checked when an application is submitted.
  async mobileTaken(target: string, excludeApplicationId?: string): Promise<boolean> {
    return this.any([
      this.prisma.application.count({ where: { mobileDigits: target, ...NOT_REJECTED, ...notId(excludeApplicationId) } }),
      this.prisma.family.count({ where: { contactDigits: target } }),
      this.prisma.familyMember.count({ where: { mobileDigits: target } }),
    ]);
  }

  async emailTaken(target: string, excludeApplicationId?: string): Promise<boolean> {
    return this.any([
      this.prisma.application.count({ where: { email: target, ...NOT_REJECTED, ...notId(excludeApplicationId) } }),
      this.prisma.family.count({ where: { email: target } }),
      this.prisma.familyMember.count({ where: { email: target } }),
      this.prisma.studentApplication.count({ where: { email: target, ...NOT_REJECTED, ...notId(excludeApplicationId) } }),
      this.prisma.student.count({ where: { email: target } }),
      this.prisma.user.count({ where: { email: target } }),
    ]);
  }

  private async any(counts: Promise<number>[]): Promise<boolean> {
    return (await Promise.all(counts)).some((count) => count > 0);
  }
}
