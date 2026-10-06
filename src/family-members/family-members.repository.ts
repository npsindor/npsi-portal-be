import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { FamilyMember, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class FamilyMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.FamilyMemberWhereInput, orderBy: Prisma.FamilyMemberOrderByWithRelationInput[], take: number, skip = 0): Promise<FamilyMember[]> {
    return this.prisma.familyMember.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<FamilyMember | null> {
    return db.familyMember.findUnique({ where: { id } });
  }

  create(data: Prisma.FamilyMemberUncheckedCreateInput, db: Db = this.prisma): Promise<FamilyMember> {
    return db.familyMember.create({ data });
  }

  // All or nothing: in its own transaction unless already inside one.
  createMany(rows: Prisma.FamilyMemberUncheckedCreateInput[], db: Db = this.prisma): Promise<FamilyMember[]> {
    const createAll = async (tx: Db): Promise<FamilyMember[]> => {
      const created: FamilyMember[] = [];
      for (const data of rows) created.push(await tx.familyMember.create({ data }));
      return created;
    };
    return db === this.prisma ? this.prisma.$transaction(createAll) : createAll(db);
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.FamilyMemberUncheckedUpdateInput, db: Db = this.prisma): Promise<FamilyMember | null> {
    const { count } = await db.familyMember.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.familyMember.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.familyMember.findMany({
      where: { membershipId: { startsWith: prefix } },
      orderBy: { membershipId: "desc" },
      take: 20,
      select: { membershipId: true },
    });
    return rows.map((row) => row.membershipId);
  }

  findByMembershipId(membershipId: string, db: Db = this.prisma): Promise<FamilyMember | null> {
    return db.familyMember.findFirst({ where: { membershipId } });
  }

  // Whether the family already has a member with this mobile or email.
  async hasContactInFamily(familyId: string, mobile: string | null, email: string | null, db: Db = this.prisma): Promise<boolean> {
    const contact: Prisma.FamilyMemberWhereInput[] = [...(mobile ? [{ mobile }] : []), ...(email ? [{ email }] : [])];
    if (!contact.length) return false;
    return (await db.familyMember.count({ where: { familyId, OR: contact } })) > 0;
  }
}
