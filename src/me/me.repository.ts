import { Injectable } from "@nestjs/common";
import { toApiRow } from "../database/column-codec.js";
import type { DbRow } from "../database/database.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { ENTITY_DEFINITIONS } from "../entities/entity-definitions.js";

const family = (row: object | null): DbRow | undefined => (row ? toApiRow(ENTITY_DEFINITIONS.Family.columns, row as DbRow) : undefined);

// Reads behind "my family" and "my feedback". Email matches are
// case-insensitive through the column collation (like LOWER(a) = LOWER(b)).
@Injectable()
export class MeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async activeFamilyByEmail(email: string): Promise<DbRow | undefined> {
    return family(await this.prisma.family.findFirst({ where: { email, status: "ACTIVE" } }));
  }

  async memberFamilyIdByEmail(email: string): Promise<{ family_id: string } | undefined> {
    return (await this.prisma.familyMember.findFirst({ where: { email }, select: { family_id: true } })) ?? undefined;
  }

  async familyByFamilyId(familyId: string): Promise<DbRow | undefined> {
    return family(await this.prisma.family.findFirst({ where: { family_id: familyId } }));
  }

  async membersOfFamily(familyId: unknown): Promise<DbRow[]> {
    const rows = await this.prisma.familyMember.findMany({ where: { family_id: String(familyId) }, orderBy: { created_at: "asc" } });
    return rows.map((row) => toApiRow(ENTITY_DEFINITIONS.FamilyMember.columns, row));
  }

  // `status != 'TRANSFERRED'` in SQL also excludes rows whose status is NULL.
  async studentByEmail(email: string): Promise<DbRow | undefined> {
    const row = await this.prisma.student.findFirst({ where: { email, AND: [{ status: { not: "TRANSFERRED" } }, { status: { not: null } }] } });
    return row ? toApiRow(ENTITY_DEFINITIONS.Student.columns, row) : undefined;
  }

  async feedbackByEmail(email: string): Promise<DbRow[]> {
    const rows = await this.prisma.feedback.findMany({ where: { email }, orderBy: { created_at: "desc" }, take: 100 });
    return rows.map((row) => toApiRow(ENTITY_DEFINITIONS.Feedback.columns, row));
  }
}
