import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { EventRegistration, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class EventRegistrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.EventRegistrationWhereInput, orderBy: Prisma.EventRegistrationOrderByWithRelationInput, take: number): Promise<EventRegistration[]> {
    return this.prisma.eventRegistration.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<EventRegistration | null> {
    return this.prisma.eventRegistration.findUnique({ where: { id } });
  }

  create(data: Prisma.EventRegistrationUncheckedCreateInput): Promise<EventRegistration> {
    return this.prisma.eventRegistration.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.EventRegistrationUncheckedUpdateInput): Promise<EventRegistration | null> {
    const { count } = await this.prisma.eventRegistration.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.eventRegistration.deleteMany({ where: { id } });
  }
}
