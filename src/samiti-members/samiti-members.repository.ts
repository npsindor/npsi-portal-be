import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, SamitiMember } from "../generated/prisma/client.js";

@Injectable()
export class SamitiMembersRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.SamitiMemberWhereInput, orderBy: Prisma.SamitiMemberOrderByWithRelationInput, take: number): Promise<SamitiMember[]> {
    return this.prisma.samitiMember.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<SamitiMember | null> {
    return this.prisma.samitiMember.findUnique({ where: { id } });
  }

  create(data: Prisma.SamitiMemberUncheckedCreateInput): Promise<SamitiMember> {
    return this.prisma.samitiMember.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.SamitiMemberUncheckedUpdateInput): Promise<SamitiMember | null> {
    const { count } = await this.prisma.samitiMember.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.samitiMember.deleteMany({ where: { id } });
  }
}
