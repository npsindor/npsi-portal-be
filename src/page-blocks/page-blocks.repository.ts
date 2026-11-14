import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { PageBlock, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class PageBlocksRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Grouped by page and section, in the admin's order.
  list(where: Prisma.PageBlockWhereInput): Promise<PageBlock[]> {
    return this.prisma.pageBlock.findMany({
      where,
      orderBy: [{ page: "asc" }, { section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: 1000,
    });
  }

  findById(id: string): Promise<PageBlock | null> {
    return this.prisma.pageBlock.findUnique({ where: { id } });
  }

  create(data: Prisma.PageBlockUncheckedCreateInput): Promise<PageBlock> {
    return this.prisma.pageBlock.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.PageBlockUncheckedUpdateInput): Promise<PageBlock | null> {
    const { count } = await this.prisma.pageBlock.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.pageBlock.deleteMany({ where: { id } });
  }
}
