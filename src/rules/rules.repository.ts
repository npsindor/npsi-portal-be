import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, Rule } from "../generated/prisma/client.js";

@Injectable()
export class RulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.RuleWhereInput, orderBy: Prisma.RuleOrderByWithRelationInput, take: number): Promise<Rule[]> {
    return this.prisma.rule.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Rule | null> {
    return this.prisma.rule.findUnique({ where: { id } });
  }

  create(data: Prisma.RuleUncheckedCreateInput): Promise<Rule> {
    return this.prisma.rule.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.RuleUncheckedUpdateInput): Promise<Rule | null> {
    const { count } = await this.prisma.rule.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.rule.deleteMany({ where: { id } });
  }
}
