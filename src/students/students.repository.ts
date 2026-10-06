import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, Student } from "../generated/prisma/client.js";

@Injectable()
export class StudentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.StudentWhereInput, orderBy: Prisma.StudentOrderByWithRelationInput, take: number): Promise<Student[]> {
    return this.prisma.student.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Student | null> {
    return this.prisma.student.findUnique({ where: { id } });
  }

  create(data: Prisma.StudentUncheckedCreateInput): Promise<Student> {
    return this.prisma.student.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.StudentUncheckedUpdateInput): Promise<Student | null> {
    const { count } = await this.prisma.student.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.student.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string): Promise<(string | null)[]> {
    const rows = await this.prisma.student.findMany({
      where: { studentId: { startsWith: prefix } },
      orderBy: { studentId: "desc" },
      take: 20,
      select: { studentId: true },
    });
    return rows.map((row) => row.studentId);
  }
}
