import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, Transaction } from "../generated/prisma/client.js";

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.TransactionWhereInput, orderBy: Prisma.TransactionOrderByWithRelationInput, take: number): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({ where: { id } });
  }

  create(data: Prisma.TransactionUncheckedCreateInput): Promise<Transaction> {
    return this.prisma.transaction.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.TransactionUncheckedUpdateInput): Promise<Transaction | null> {
    const { count } = await this.prisma.transaction.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.transaction.deleteMany({ where: { id } });
  }

  async existsForReference(referenceId: string): Promise<boolean> {
    return (await this.prisma.transaction.count({ where: { referenceId } })) > 0;
  }
}
