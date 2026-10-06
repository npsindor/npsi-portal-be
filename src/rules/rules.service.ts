import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateRuleDto, RuleListQueryDto, UpdateRuleDto } from "./dto/rules.dto.js";
import { RulesRepository } from "./rules.repository.js";
import { type RuleVo, toRuleVo } from "./vo/rules.vo.js";

@Injectable()
export class RulesService {
  constructor(private readonly repo: RulesRepository) {}

  async list(query: RuleListQueryDto): Promise<RuleVo[]> {
    const where: Prisma.RuleWhereInput = {};
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toRuleVo);
  }

  async create(dto: CreateRuleDto): Promise<RuleVo> {
    return toRuleVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdateRuleDto): Promise<RuleVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toRuleVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateRuleDto): Omit<Prisma.RuleUncheckedCreateInput, "id"> => ({
  sectionNumber: input.sectionNumber,
  titleEn: input.titleEn,
  titleHi: input.titleHi,
  contentEn: input.contentEn,
  contentHi: input.contentHi,
  status: input.status,
});

const toUpdateData = (input: UpdateRuleDto): Prisma.RuleUncheckedUpdateInput => ({
  sectionNumber: input.sectionNumber,
  titleEn: input.titleEn,
  titleHi: input.titleHi,
  contentEn: input.contentEn,
  contentHi: input.contentHi,
  status: input.status,
  updatedAt: new Date(),
});
