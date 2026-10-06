import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, SamitiMember } from "../generated/prisma/client.js";

@Injectable()
export class SamitiMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.SamitiMemberWhereInput, orderBy: Prisma.SamitiMemberOrderByWithRelationInput, take: number): Promise<SamitiMember[]> {
    return this.prisma.samitiMember.findMany({ where, orderBy, take });
  }

  findById(id: string, db: Db = this.prisma): Promise<SamitiMember | null> {
    return db.samitiMember.findUnique({ where: { id } });
  }

  create(data: Prisma.SamitiMemberUncheckedCreateInput, db: Db = this.prisma): Promise<SamitiMember> {
    return db.samitiMember.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.SamitiMemberUncheckedUpdateInput, db: Db = this.prisma): Promise<SamitiMember | null> {
    const { count } = await db.samitiMember.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.samitiMember.deleteMany({ where: { id } });
  }
}
