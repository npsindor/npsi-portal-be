import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { FamilyMember, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class FamilyMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.FamilyMemberWhereInput, orderBy: Prisma.FamilyMemberOrderByWithRelationInput, take: number): Promise<FamilyMember[]> {
    return this.prisma.familyMember.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<FamilyMember | null> {
    return this.prisma.familyMember.findUnique({ where: { id } });
  }

  create(data: Prisma.FamilyMemberUncheckedCreateInput): Promise<FamilyMember> {
    return this.prisma.familyMember.create({ data });
  }

  // All or nothing.
  createMany(rows: Prisma.FamilyMemberUncheckedCreateInput[]): Promise<FamilyMember[]> {
    return this.prisma.$transaction(rows.map((data) => this.prisma.familyMember.create({ data })));
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.FamilyMemberUncheckedUpdateInput): Promise<FamilyMember | null> {
    const { count } = await this.prisma.familyMember.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.familyMember.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string): Promise<(string | null)[]> {
    const rows = await this.prisma.familyMember.findMany({
      where: { membershipId: { startsWith: prefix } },
      orderBy: { membershipId: "desc" },
      take: 20,
      select: { membershipId: true },
    });
    return rows.map((row) => row.membershipId);
  }
}
