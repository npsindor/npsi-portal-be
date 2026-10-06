import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Event, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.EventWhereInput, orderBy: Prisma.EventOrderByWithRelationInput, take: number): Promise<Event[]> {
    return this.prisma.event.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({ where: { id } });
  }

  create(data: Prisma.EventUncheckedCreateInput): Promise<Event> {
    return this.prisma.event.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.EventUncheckedUpdateInput): Promise<Event | null> {
    const { count } = await this.prisma.event.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.event.deleteMany({ where: { id } });
  }

  // An event's fee per member, or null when the event doesn't exist.
  async feeOf(id: string): Promise<number | null> {
    const event = await this.prisma.event.findUnique({ where: { id }, select: { fee: true } });
    return event ? (event.fee?.toNumber() ?? 0) : null;
  }
}
