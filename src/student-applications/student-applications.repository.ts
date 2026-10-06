import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, StudentApplication } from "../generated/prisma/client.js";

@Injectable()
export class StudentApplicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.StudentApplicationWhereInput, orderBy: Prisma.StudentApplicationOrderByWithRelationInput, take: number): Promise<StudentApplication[]> {
    return this.prisma.studentApplication.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<StudentApplication | null> {
    return this.prisma.studentApplication.findUnique({ where: { id } });
  }

  create(data: Prisma.StudentApplicationUncheckedCreateInput): Promise<StudentApplication> {
    return this.prisma.studentApplication.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.StudentApplicationUncheckedUpdateInput): Promise<StudentApplication | null> {
    const { count } = await this.prisma.studentApplication.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.studentApplication.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string): Promise<(string | null)[]> {
    const rows = await this.prisma.studentApplication.findMany({
      where: { applicationId: { startsWith: prefix } },
      orderBy: { applicationId: "desc" },
      take: 20,
      select: { applicationId: true },
    });
    return rows.map((row) => row.applicationId);
  }
}
