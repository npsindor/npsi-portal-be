import { Injectable } from "@nestjs/common";
import { withContactFields } from "../common/utils/text.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Family, Prisma } from "../generated/prisma/client.js";

// Every save keeps the digits of the contactNumber (duplicate checks) and a trimmed email.
const contact = <T extends object>(data: T): T => withContactFields(data, "contactNumber", "contactDigits");

@Injectable()
export class FamiliesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.FamilyWhereInput, orderBy: Prisma.FamilyOrderByWithRelationInput[], take: number, skip = 0): Promise<Family[]> {
    return this.prisma.family.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<Family | null> {
    return db.family.findUnique({ where: { id } });
  }

  create(data: Prisma.FamilyUncheckedCreateInput, db: Db = this.prisma): Promise<Family> {
    return db.family.create({ data: contact(data) });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.FamilyUncheckedUpdateInput, db: Db = this.prisma): Promise<Family | null> {
    const { count } = await db.family.updateMany({ where: { id }, data: contact(data) });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.family.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.family.findMany({
      where: { familyId: { startsWith: prefix } },
      orderBy: { familyId: "desc" },
      take: 20,
      select: { familyId: true },
    });
    return rows.map((row) => row.familyId);
  }

  findByFamilyId(familyId: string, db: Db = this.prisma, status?: string): Promise<Family | null> {
    return db.family.findFirst({ where: { familyId, status } });
  }

  // Never below zero.
  async changeMemberCount(id: string, delta: number, db: Db = this.prisma): Promise<void> {
    const family = await db.family.findUnique({ where: { id }, select: { memberCount: true } });
    if (family) await db.family.update({ where: { id }, data: { memberCount: Math.max((family.memberCount ?? 0) + delta, 0) } });
  }
}
