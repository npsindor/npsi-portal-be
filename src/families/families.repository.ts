import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Family, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class FamiliesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.FamilyWhereInput, orderBy: Prisma.FamilyOrderByWithRelationInput, take: number): Promise<Family[]> {
    return this.prisma.family.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Family | null> {
    return this.prisma.family.findUnique({ where: { id } });
  }

  create(data: Prisma.FamilyUncheckedCreateInput): Promise<Family> {
    return this.prisma.family.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.FamilyUncheckedUpdateInput): Promise<Family | null> {
    const { count } = await this.prisma.family.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.family.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string): Promise<(string | null)[]> {
    const rows = await this.prisma.family.findMany({
      where: { familyId: { startsWith: prefix } },
      orderBy: { familyId: "desc" },
      take: 20,
      select: { familyId: true },
    });
    return rows.map((row) => row.familyId);
  }
}
