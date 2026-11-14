import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Notification, Prisma } from "../generated/prisma/client.js";

// Notifications for everyone: no recipient family and no recipient account. Before this module, the
// admin screen's "everyone" was stored as an empty string, so that counts too.
const BROADCAST: Prisma.NotificationWhereInput[] = [
  { recipientFamilyId: null, recipientUserId: null },
  { recipientFamilyId: "", recipientUserId: null },
];

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // `member` narrows the list to that member's family, their own account's notifications, and broadcasts;
  // null (admins) lists everything.
  list(
    member: { familyId: string | null; userId: string } | null,
    orderBy: Prisma.NotificationOrderByWithRelationInput[],
    take: number,
    skip = 0,
  ): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where:
        member === null ? {} : { OR: [...(member.familyId ? [{ recipientFamilyId: member.familyId }] : []), { recipientUserId: member.userId }, ...BROADCAST] },
      orderBy,
      take,
      skip,
    });
  }

  findById(id: string): Promise<Notification | null> {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  recipientOf(id: string): Promise<{ recipientFamilyId: string | null; recipientUserId: string | null } | null> {
    return this.prisma.notification.findUnique({ where: { id }, select: { recipientFamilyId: true, recipientUserId: true } });
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

  // Of these notifications, the ones this member has marked read.
  async readBy(userId: string, notificationIds: string[]): Promise<Set<string>> {
    if (!notificationIds.length) return new Set();
    const rows = await this.prisma.notificationRead.findMany({ where: { userId, notificationId: { in: notificationIds } }, select: { notificationId: true } });
    return new Set(rows.map((row) => row.notificationId));
  }

  // A member marks a broadcast read (or unread again) for themselves only.
  async setReadBy(userId: string, notificationId: string, read: boolean): Promise<void> {
    if (read) {
      await this.prisma.notificationRead.upsert({
        where: { notificationId_userId: { notificationId, userId } },
        create: { notificationId, userId },
        update: {},
      });
    } else {
      await this.prisma.notificationRead.deleteMany({ where: { notificationId, userId } });
    }
  }
}
