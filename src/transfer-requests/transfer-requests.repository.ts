import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, TransferRequest } from "../generated/prisma/client.js";

@Injectable()
export class TransferRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.TransferRequestWhereInput, orderBy: Prisma.TransferRequestOrderByWithRelationInput[], take: number, skip = 0): Promise<TransferRequest[]> {
    return this.prisma.transferRequest.findMany({ where, orderBy, take, skip });
  }

  findById(id: string, db: Db = this.prisma): Promise<TransferRequest | null> {
    return db.transferRequest.findUnique({ where: { id } });
  }

  create(data: Prisma.TransferRequestUncheckedCreateInput, db: Db = this.prisma): Promise<TransferRequest> {
    return db.transferRequest.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.TransferRequestUncheckedUpdateInput, db: Db = this.prisma): Promise<TransferRequest | null> {
    const { count } = await db.transferRequest.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.transferRequest.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string, db: Db = this.prisma): Promise<(string | null)[]> {
    const rows = await db.transferRequest.findMany({
      where: { requestId: { startsWith: prefix } },
      orderBy: { requestId: "desc" },
      take: 20,
      select: { requestId: true },
    });
    return rows.map((row) => row.requestId);
  }
}
