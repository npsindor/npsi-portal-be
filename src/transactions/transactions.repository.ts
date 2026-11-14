import { Injectable } from "@nestjs/common";
import { displayIdPrefixRange } from "../common/utils/display-ids.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, Transaction } from "../generated/prisma/client.js";

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.TransactionWhereInput, orderBy: Prisma.TransactionOrderByWithRelationInput[], take: number, skip = 0): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({ where, orderBy, take, skip });
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

  // The registration fee recorded for an application (its display id is the reference), newest first.
  feeFor(applicationId: string, db: Db = this.prisma): Promise<Transaction | null> {
    return db.transaction.findFirst({
      where: { referenceId: applicationId, type: { in: ["Family Registration", "Student Registration"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  feesFor(applicationIds: string[]): Promise<Transaction[]> {
    if (!applicationIds.length) return Promise.resolve([]);
    return this.prisma.transaction.findMany({
      where: { referenceId: { in: applicationIds }, type: { in: ["Family Registration", "Student Registration"] } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  registrationFees(status: string | undefined, take: number, skip = 0): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: { type: { in: ["Family Registration", "Student Registration"] }, ...(status ? { paymentStatus: status } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take,
      skip,
    });
  }

  // The latest TXN- ids, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.transaction.findMany({
      where: { transactionId: displayIdPrefixRange(prefix) },
      orderBy: { transactionId: "desc" },
      take: 20,
      select: { transactionId: true },
    });
    return rows.map((row) => row.transactionId);
  }
}
