import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import type { Principle, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class PrinciplesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.PrincipleWhereInput, orderBy: Prisma.PrincipleOrderByWithRelationInput, take: number): Promise<Principle[]> {
    return this.prisma.principle.findMany({ where, orderBy, take });
  }

  findById(id: string): Promise<Principle | null> {
    return this.prisma.principle.findUnique({ where: { id } });
  }

  create(data: Prisma.PrincipleUncheckedCreateInput): Promise<Principle> {
    return this.prisma.principle.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.PrincipleUncheckedUpdateInput): Promise<Principle | null> {
    const { count } = await this.prisma.principle.updateMany({ where: { id }, data });
    return count ? this.findById(id) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.principle.deleteMany({ where: { id } });
  }
}
