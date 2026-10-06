import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Notification, Prisma } from "../generated/prisma/client.js";

// Notifications for everyone: no recipient. Before this module, the admin screen's
// "everyone" was stored as an empty string, so that counts too.
const BROADCAST: Prisma.NotificationWhereInput[] = [{ recipientFamilyId: null }, { recipientFamilyId: "" }];

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // `recipientFamilyId` (members) narrows the list to that family plus broadcasts.
  list(recipientFamilyId: string | null, orderBy: Prisma.NotificationOrderByWithRelationInput, take: number): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: recipientFamilyId === null ? {} : { OR: [{ recipientFamilyId }, ...BROADCAST] },
      orderBy,
      take,
    });
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  recipientOf(id: string): Promise<{ recipientFamilyId: string | null } | null> {
    return this.prisma.notification.findUnique({ where: { id }, select: { recipientFamilyId: true } });
  }

  create(data: Prisma.NotificationUncheckedCreateInput, db: Db = this.prisma): Promise<Notification> {
    return db.notification.create({ data });
  }

  // All or nothing.
  createMany(rows: Prisma.NotificationUncheckedCreateInput[]): Promise<Notification[]> {
    return this.prisma.$transaction(rows.map((data) => this.prisma.notification.create({ data })));
  }

  // No error when the id doesn't exist (the caller reports 404 after re-reading).
  async update(id: string, data: Prisma.NotificationUncheckedUpdateInput): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { id } });
  }
}
