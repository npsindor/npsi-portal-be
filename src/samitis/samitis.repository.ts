import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, Samiti } from "../generated/prisma/client.js";

@Injectable()
export class SamitisRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.SamitiWhereInput, orderBy: Prisma.SamitiOrderByWithRelationInput, take: number): Promise<Samiti[]> {
    return this.prisma.samiti.findMany({ where, orderBy, take });
  }

  findById(id: string, db: Db = this.prisma): Promise<Samiti | null> {
    return db.samiti.findUnique({ where: { id } });
  }

  create(data: Prisma.SamitiUncheckedCreateInput, db: Db = this.prisma): Promise<Samiti> {
    return db.samiti.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.SamitiUncheckedUpdateInput, db: Db = this.prisma): Promise<Samiti | null> {
    const { count } = await db.samiti.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.samiti.deleteMany({ where: { id } });
  }
}
