import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { HomeHighlight, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class HomeHighlightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.HomeHighlightWhereInput): Promise<HomeHighlight[]> {
    return this.prisma.homeHighlight.findMany({ where, orderBy: [{ slider: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 200 });
  }

  findById(id: string): Promise<HomeHighlight | null> {
    return this.prisma.homeHighlight.findUnique({ where: { id } });
  }

  create(data: Prisma.HomeHighlightUncheckedCreateInput): Promise<HomeHighlight> {
    return this.prisma.homeHighlight.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.HomeHighlightUncheckedUpdateInput): Promise<HomeHighlight | null> {
    const { count } = await this.prisma.homeHighlight.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.homeHighlight.deleteMany({ where: { id } });
  }
}
