import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Announcement, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class AnnouncementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.AnnouncementWhereInput, orderBy: Prisma.AnnouncementOrderByWithRelationInput[], take: number, skip = 0): Promise<Announcement[]> {
    return this.prisma.announcement.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<Announcement | null> {
    return db.announcement.findUnique({ where: { id } });
  }

  create(data: Prisma.AnnouncementUncheckedCreateInput, db: Db = this.prisma): Promise<Announcement> {
    return db.announcement.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.AnnouncementUncheckedUpdateInput, db: Db = this.prisma): Promise<Announcement | null> {
    const { count } = await db.announcement.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.announcement.deleteMany({ where: { id } });
  }
}
