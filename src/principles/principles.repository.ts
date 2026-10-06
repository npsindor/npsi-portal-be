import { Injectable } from "@nestjs/common";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Principle, Prisma } from "../generated/prisma/client.js";

@Injectable()
export class PrinciplesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(where: Prisma.PrincipleWhereInput, orderBy: Prisma.PrincipleOrderByWithRelationInput, take: number): Promise<Principle[]> {
    return this.prisma.principle.findMany({ where, orderBy, take });
  }

  findById(id: string, db: Db = this.prisma): Promise<Principle | null> {
    return db.principle.findUnique({ where: { id } });
  }

  create(data: Prisma.PrincipleUncheckedCreateInput, db: Db = this.prisma): Promise<Principle> {
    return db.principle.create({ data });
  }

  // null when the id doesn't exist.
  async update(id: string, data: Prisma.PrincipleUncheckedUpdateInput, db: Db = this.prisma): Promise<Principle | null> {
    const { count } = await db.principle.updateMany({ where: { id }, data });
    return count ? this.findById(id, db) : null;
  }

  // Deleting an id that doesn't exist is not an error.
  async delete(id: string): Promise<void> {
    await this.prisma.principle.deleteMany({ where: { id } });
  }
}
