import { Injectable } from "@nestjs/common";
import { withContactFields } from "../common/utils/text.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Application, Prisma } from "../generated/prisma/client.js";

// Every save keeps the digits of the mobile (duplicate checks) and a trimmed email.
const contact = <T extends object>(data: T): T => withContactFields(data, "mobile", "mobileDigits");

@Injectable()
export class ApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.ApplicationWhereInput, orderBy: Prisma.ApplicationOrderByWithRelationInput[], take: number, skip = 0): Promise<Application[]> {
    return this.prisma.application.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<Application | null> {
    return db.application.findUnique({ where: { id } });
  }

  create(data: Prisma.ApplicationUncheckedCreateInput, db: Db = this.prisma): Promise<Application> {
    return db.application.create({ data: contact(data) });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.ApplicationUncheckedUpdateInput, db: Db = this.prisma): Promise<Application | null> {
    const { count } = await db.application.updateMany({ where: { id }, data: contact(data) });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.application.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.application.findMany({
      where: { applicationId: { startsWith: prefix } },
      orderBy: { applicationId: "desc" },
      take: 20,
      select: { applicationId: true },
    });
    return rows.map((row) => row.applicationId);
  }
}
