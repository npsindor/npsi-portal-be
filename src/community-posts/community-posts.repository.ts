import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { CommunityPost, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class CommunityPostsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Featured first, then the admin's order, newest first on ties.
  list(where: Prisma.CommunityPostWhereInput): Promise<CommunityPost[]> {
    return this.prisma.communityPost.findMany({
      where,
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
      take: 300,
    });
  }

  findById(id: string): Promise<CommunityPost | null> {
    return this.prisma.communityPost.findUnique({ where: { id } });
  }

  create(data: Prisma.CommunityPostUncheckedCreateInput): Promise<CommunityPost> {
    return this.prisma.communityPost.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.CommunityPostUncheckedUpdateInput): Promise<CommunityPost | null> {
    const { count } = await this.prisma.communityPost.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.communityPost.deleteMany({ where: { id } });
  }
}
