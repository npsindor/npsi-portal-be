import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, Samiti } from "../generated/prisma/client.js";

@Injectable()
export class SamitisRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.SamitiWhereInput, orderBy: Prisma.SamitiOrderByWithRelationInput, take: number): Promise<Samiti[]> {
    return this.prisma.samiti.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Samiti | null> {
    return this.prisma.samiti.findUnique({ where: { id } });
  }

  create(data: Prisma.SamitiUncheckedCreateInput): Promise<Samiti> {
    return this.prisma.samiti.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.SamitiUncheckedUpdateInput): Promise<Samiti | null> {
    const { count } = await this.prisma.samiti.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.samiti.deleteMany({ where: { id } });
  }
}
