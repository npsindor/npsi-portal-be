import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma, TransferRequest } from "../generated/prisma/client.js";

@Injectable()
export class TransferRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.TransferRequestWhereInput, orderBy: Prisma.TransferRequestOrderByWithRelationInput, take: number): Promise<TransferRequest[]> {
    return this.prisma.transferRequest.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<TransferRequest | null> {
    return this.prisma.transferRequest.findUnique({ where: { id } });
  }

  create(data: Prisma.TransferRequestUncheckedCreateInput): Promise<TransferRequest> {
    return this.prisma.transferRequest.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.TransferRequestUncheckedUpdateInput): Promise<TransferRequest | null> {
    const { count } = await this.prisma.transferRequest.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.transferRequest.deleteMany({ where: { id } });
  }

  // The latest display ids with this prefix, for allocating the next one.
  async latestDisplayIds(prefix: string): Promise<(string | null)[]> {
    const rows = await this.prisma.transferRequest.findMany({
      where: { requestId: { startsWith: prefix } },
      orderBy: { requestId: "desc" },
      take: 20,
      select: { requestId: true },
    });
    return rows.map((row) => row.requestId);
  }
}
