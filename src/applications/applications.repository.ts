import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Application, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.ApplicationWhereInput, orderBy: Prisma.ApplicationOrderByWithRelationInput, take: number): Promise<Application[]> {
    return this.prisma.application.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Application | null> {
    return this.prisma.application.findUnique({ where: { id } });
  }

  create(data: Prisma.ApplicationUncheckedCreateInput): Promise<Application> {
    return this.prisma.application.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.ApplicationUncheckedUpdateInput): Promise<Application | null> {
    const { count } = await this.prisma.application.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.application.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string): Promise<(string | null)[]> {
    const rows = await this.prisma.application.findMany({
      where: { applicationId: { startsWith: prefix } },
      orderBy: { applicationId: "desc" },
      take: 20,
      select: { applicationId: true },
    });
    return rows.map((row) => row.applicationId);
  }
}
