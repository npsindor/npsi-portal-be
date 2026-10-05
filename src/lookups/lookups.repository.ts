import { Injectable } from "@nestjs/common";
import { toApiRow } from "../database/column-codec.js";
import type { DbRow } from "../database/database.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { ENTITY_DEFINITIONS } from "../entities/entity-definitions.js";
import { Prisma } from "../generated/prisma/client.js";

const NOT_REJECTED = Prisma.sql`(status IS NULL OR status <> 'REJECTED')`;
const notId = (id?: string) => (id === undefined ? Prisma.sql`TRUE` : Prisma.sql`id <> ${id}`);
// Digits only, last 10 — the same normalization as normalizeMobile().
const mobileEquals = (target: string) => (column: Prisma.Sql) => Prisma.sql`RIGHT(REGEXP_REPLACE(COALESCE(${column}, ''), '[^0-9]', ''), 10) = ${target}`;

// Reads behind the public lookups and the duplicate-contact checks.
@Injectable()
export class LookupsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async publicFamily(familyId: string): Promise<DbRow | undefined> {
    const row = await this.prisma.family.findFirst({
      where: { family_id: familyId },
      select: { family_id: true, family_name: true, head_name: true, status: true, city: true, registration_date: true },
    });
    return row ?? undefined;
  }

  publicMembers(familyId: string): Promise<DbRow[]> {
    return this.prisma.familyMember.findMany({
      where: { family_id: familyId },
      select: { name: true, relationship: true, gender: true, status: true },
      orderBy: { created_at: "asc" },
    });
  }

  async application(applicationId: string, mobile: string): Promise<DbRow | undefined> {
    const row = await this.prisma.application.findFirst({ where: { application_id: applicationId, mobile } });
    return row ? toApiRow(ENTITY_DEFINITIONS.Application.columns, row) : undefined;
  }

  // Counts come back as numbers, like COUNT(*) did.
  async activeCounts(): Promise<{ families: number; members: number }> {
    const [families, members] = await Promise.all([
      this.prisma.family.count({ where: { status: "ACTIVE" } }),
      this.prisma.familyMember.count({ where: { status: "ACTIVE" } }),
    ]);
    return { families, members };
  }

  // Duplicate-contact checks, evaluated in MySQL instead of loading whole
  // tables: mobiles compare on their last 10 digits, emails trimmed and
  // case-insensitively, and rejected applications never count (a NULL status
  // does count, as it always did).

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
