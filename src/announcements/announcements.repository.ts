import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Announcement, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class AnnouncementsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.AnnouncementWhereInput, orderBy: Prisma.AnnouncementOrderByWithRelationInput, take: number): Promise<Announcement[]> {
    return this.prisma.announcement.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Announcement | null> {
    return this.prisma.announcement.findUnique({ where: { id } });
  }

  create(data: Prisma.AnnouncementUncheckedCreateInput): Promise<Announcement> {
    return this.prisma.announcement.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.AnnouncementUncheckedUpdateInput): Promise<Announcement | null> {
    const { count } = await this.prisma.announcement.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.announcement.deleteMany({ where: { id } });
  }
}
