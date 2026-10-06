import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, Rule } from "../generated/prisma/client.js";

@Injectable()
export class RulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.RuleWhereInput, orderBy: Prisma.RuleOrderByWithRelationInput[], take: number, skip = 0): Promise<Rule[]> {
    return this.prisma.rule.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<Rule | null> {
    return db.rule.findUnique({ where: { id } });
  }

  create(data: Prisma.RuleUncheckedCreateInput, db: Db = this.prisma): Promise<Rule> {
    return db.rule.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.RuleUncheckedUpdateInput, db: Db = this.prisma): Promise<Rule | null> {
    const { count } = await db.rule.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.rule.deleteMany({ where: { id } });
  }
}
