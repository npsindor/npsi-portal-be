import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Feedback, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.FeedbackWhereInput, orderBy: Prisma.FeedbackOrderByWithRelationInput[], take: number, skip = 0): Promise<Feedback[]> {
    return this.prisma.feedback.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<Feedback | null> {
    return db.feedback.findUnique({ where: { id } });
  }

  create(data: Prisma.FeedbackUncheckedCreateInput, db: Db = this.prisma): Promise<Feedback> {
    return db.feedback.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.FeedbackUncheckedUpdateInput, db: Db = this.prisma): Promise<Feedback | null> {
    const { count } = await db.feedback.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.feedback.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.feedback.findMany({
      where: { feedbackId: { startsWith: prefix } },
      orderBy: { feedbackId: "desc" },
      take: 20,
      select: { feedbackId: true },
    });
    return rows.map((row) => row.feedbackId);
  }
}
