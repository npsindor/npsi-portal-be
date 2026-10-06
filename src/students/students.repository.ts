import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, Student } from "../generated/prisma/client.js";

@Injectable()
export class StudentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.StudentWhereInput, orderBy: Prisma.StudentOrderByWithRelationInput[], take: number, skip = 0): Promise<Student[]> {
    return this.prisma.student.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<Student | null> {
    return db.student.findUnique({ where: { id } });
  }

  create(data: Prisma.StudentUncheckedCreateInput, db: Db = this.prisma): Promise<Student> {
    return db.student.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.StudentUncheckedUpdateInput, db: Db = this.prisma): Promise<Student | null> {
    const { count } = await db.student.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.student.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.student.findMany({
      where: { studentId: { startsWith: prefix } },
      orderBy: { studentId: "desc" },
      take: 20,
      select: { studentId: true },
    });
    return rows.map((row) => row.studentId);
  }

  findByStudentId(studentId: string, db: Db = this.prisma): Promise<Student | null> {
    return db.student.findFirst({ where: { studentId } });
  }
}
