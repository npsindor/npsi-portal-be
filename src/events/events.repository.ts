import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Event, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.EventWhereInput, orderBy: Prisma.EventOrderByWithRelationInput, take: number): Promise<Event[]> {
    return this.prisma.event.findMany({ where, orderBy, take });
  }

  findById(id: string, db: Db = this.prisma): Promise<Event | null> {
    return db.event.findUnique({ where: { id } });
  }

  create(data: Prisma.EventUncheckedCreateInput, db: Db = this.prisma): Promise<Event> {
    return db.event.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.EventUncheckedUpdateInput, db: Db = this.prisma): Promise<Event | null> {
    const { count } = await db.event.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.event.deleteMany({ where: { id } });
  }

  // An event's title and fee per member, or null when the event doesn't exist.
  async feeOf(id: string, db: Db = this.prisma): Promise<{ title: string; fee: number } | null> {
    const event = await db.event.findUnique({ where: { id }, select: { title: true, fee: true } });
    return event ? { title: event.title, fee: event.fee?.toNumber() ?? 0 } : null;
  }
}
