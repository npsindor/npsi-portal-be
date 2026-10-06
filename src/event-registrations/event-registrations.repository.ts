import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { EventRegistration, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class EventRegistrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(
    where: Prisma.EventRegistrationWhereInput,
    orderBy: Prisma.EventRegistrationOrderByWithRelationInput[],
    take: number,
    skip = 0,
  ): Promise<EventRegistration[]> {
    return this.prisma.eventRegistration.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<EventRegistration | null> {
    return db.eventRegistration.findUnique({ where: { id } });
  }

  create(data: Prisma.EventRegistrationUncheckedCreateInput, db: Db = this.prisma): Promise<EventRegistration> {
    return db.eventRegistration.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.EventRegistrationUncheckedUpdateInput, db: Db = this.prisma): Promise<EventRegistration | null> {
    const { count } = await db.eventRegistration.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.eventRegistration.deleteMany({ where: { id } });
  }

  // The latest EVT-REG- ids, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.eventRegistration.findMany({
      where: { registrationId: { startsWith: prefix } },
      orderBy: { registrationId: "desc" },
      take: 20,
      select: { registrationId: true },
    });
    return rows.map((row) => row.registrationId);
  }
}
