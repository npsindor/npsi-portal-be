import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreatePrincipleDto, PrincipleListQueryDto, UpdatePrincipleDto } from "./dto/principles.dto.js";
import { PrinciplesRepository } from "./principles.repository.js";
import { type PrincipleVo, toPrincipleVo } from "./vo/principles.vo.js";

@Injectable()
export class PrinciplesService {
  constructor(private readonly repo: PrinciplesRepository) {}

  async list(query: PrincipleListQueryDto): Promise<PrincipleVo[]> {
    const where: Prisma.PrincipleWhereInput = {};
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toPrincipleVo);
  }

  async create(dto: CreatePrincipleDto): Promise<PrincipleVo> {
    return toPrincipleVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdatePrincipleDto): Promise<PrincipleVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toPrincipleVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreatePrincipleDto): Omit<Prisma.PrincipleUncheckedCreateInput, "id"> => ({
  sectionNumber: input.sectionNumber,
  titleEn: input.titleEn,
  titleHi: input.titleHi,
  contentEn: input.contentEn,
  contentHi: input.contentHi,
  status: input.status,
});

const toUpdateData = (input: UpdatePrincipleDto): Prisma.PrincipleUncheckedUpdateInput => ({
  sectionNumber: input.sectionNumber,
  titleEn: input.titleEn,
  titleHi: input.titleHi,
  contentEn: input.contentEn,
  contentHi: input.contentHi,
  status: input.status,
  updatedAt: new Date(),
});
