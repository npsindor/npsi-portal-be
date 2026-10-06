import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, Transaction } from "../generated/prisma/client.js";

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.TransactionWhereInput, orderBy: Prisma.TransactionOrderByWithRelationInput, take: number): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({ where, orderBy, take });
  }

  findById(id: string, db: Db = this.prisma): Promise<Transaction | null> {
    return db.transaction.findUnique({ where: { id } });
  }

  create(data: Prisma.TransactionUncheckedCreateInput, db: Db = this.prisma): Promise<Transaction> {
    return db.transaction.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.TransactionUncheckedUpdateInput, db: Db = this.prisma): Promise<Transaction | null> {
    const { count } = await db.transaction.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.transaction.deleteMany({ where: { id } });
  }

  // The latest TXN- ids, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.transaction.findMany({
      where: { transactionId: { startsWith: prefix } },
      orderBy: { transactionId: "desc" },
      take: 20,
      select: { transactionId: true },
    });
    return rows.map((row) => row.transactionId);
  }
}
