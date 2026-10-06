import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { type Application, Prisma } from "../generated/prisma/client.js";

const NOT_REJECTED = Prisma.sql`(status IS NULL OR status <> 'REJECTED')`;
const notId = (id?: string) => (id === undefined ? Prisma.sql`TRUE` : Prisma.sql`id <> ${id}`);
// Digits only, last 10: the same normalization as normalizeMobile().
const mobileEquals = (target: string) => (column: Prisma.Sql) => Prisma.sql`RIGHT(REGEXP_REPLACE(COALESCE(${column}, ''), '[^0-9]', ''), 10) = ${target}`;

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

  // Duplicate-contact checks run as one SQL query each: mobiles compare on
  // their last 10 digits whatever was typed (REGEXP_REPLACE, which Prisma's
  // query API can't express), emails trimmed and case-insensitively, and
  // rejected applications never count (a NULL status does).

  // Public "is this mobile free?" check (all five contact sources).
  mobileUsedAnywhere(target: string): Promise<boolean> {
    const m = mobileEquals(target);
    return this.exists(Prisma.sql`
      EXISTS(SELECT 1 FROM applications WHERE ${NOT_REJECTED} AND ${m(Prisma.raw("mobile"))})
      OR EXISTS(SELECT 1 FROM families WHERE ${m(Prisma.raw("contact_number"))})
      OR EXISTS(SELECT 1 FROM family_members WHERE ${m(Prisma.raw("mobile"))})
      OR EXISTS(SELECT 1 FROM student_applications WHERE ${NOT_REJECTED} AND ${m(Prisma.raw("mobile"))})
      OR EXISTS(SELECT 1 FROM students WHERE ${m(Prisma.raw("mobile"))})`);
  }

  // Mobile already claimed, checked when an application is submitted.
  mobileTaken(target: string, excludeApplicationId?: string): Promise<boolean> {
    const m = mobileEquals(target);
    return this.exists(Prisma.sql`
      EXISTS(SELECT 1 FROM applications WHERE ${NOT_REJECTED} AND ${notId(excludeApplicationId)} AND ${m(Prisma.raw("mobile"))})
      OR EXISTS(SELECT 1 FROM families WHERE ${m(Prisma.raw("contact_number"))})
      OR EXISTS(SELECT 1 FROM family_members WHERE ${m(Prisma.raw("mobile"))})`);
  }

  emailTaken(target: string, excludeApplicationId?: string): Promise<boolean> {
    const e = Prisma.sql`LOWER(TRIM(email)) = ${target}`;
    return this.exists(Prisma.sql`
      EXISTS(SELECT 1 FROM applications WHERE ${NOT_REJECTED} AND ${notId(excludeApplicationId)} AND ${e})
      OR EXISTS(SELECT 1 FROM families WHERE ${e})
      OR EXISTS(SELECT 1 FROM family_members WHERE ${e})
      OR EXISTS(SELECT 1 FROM student_applications WHERE ${NOT_REJECTED} AND ${notId(excludeApplicationId)} AND ${e})
      OR EXISTS(SELECT 1 FROM students WHERE ${e})
      OR EXISTS(SELECT 1 FROM users WHERE ${e})`);
  }

  private async exists(condition: Prisma.Sql): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ found: bigint | number }[]>(Prisma.sql`SELECT (${condition}) AS found`);
    return Number(row?.found) === 1;
  }
}
