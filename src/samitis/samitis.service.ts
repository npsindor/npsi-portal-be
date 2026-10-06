import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateSamitiDto, SamitiListQueryDto, UpdateSamitiDto } from "./dto/samitis.dto.js";
import { SamitisRepository } from "./samitis.repository.js";
import { type SamitiVo, toSamitiVo } from "./vo/samitis.vo.js";

@Injectable()
export class SamitisService {
  constructor(private readonly repo: SamitisRepository) {}

  async list(query: SamitiListQueryDto): Promise<SamitiVo[]> {
    const where: Prisma.SamitiWhereInput = {};
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toSamitiVo);
  }

  async create(dto: CreateSamitiDto): Promise<SamitiVo> {
    return toSamitiVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdateSamitiDto): Promise<SamitiVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toSamitiVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateSamitiDto): Omit<Prisma.SamitiUncheckedCreateInput, "id"> => ({
  name: input.name,
  description: input.description,
  formedDate: parseDate(input.formedDate),
  status: input.status,
});

const toUpdateData = (input: UpdateSamitiDto): Prisma.SamitiUncheckedUpdateInput => ({
  name: input.name,
  description: input.description,
  formedDate: parseDate(input.formedDate),
  status: input.status,
  updatedAt: new Date(),
});
