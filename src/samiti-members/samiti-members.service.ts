import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateSamitiMemberDto, SamitiMemberListQueryDto, UpdateSamitiMemberDto } from "./dto/samiti-members.dto.js";
import { SamitiMembersRepository } from "./samiti-members.repository.js";
import { type SamitiMemberVo, toSamitiMemberVo } from "./vo/samiti-members.vo.js";

@Injectable()
export class SamitiMembersService {
  constructor(private readonly repo: SamitiMembersRepository) {}

  async list(query: SamitiMemberListQueryDto): Promise<SamitiMemberVo[]> {
    const where: Prisma.SamitiMemberWhereInput = { samitiId: query.samitiId };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toSamitiMemberVo);
  }

  async create(dto: CreateSamitiMemberDto): Promise<SamitiMemberVo> {
    return toSamitiMemberVo(await this.repo.create({ id: randomId(), ...toCreateData(dto) }));
  }

  async update(id: string, dto: UpdateSamitiMemberDto): Promise<SamitiMemberVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toSamitiMemberVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateSamitiMemberDto): Omit<Prisma.SamitiMemberUncheckedCreateInput, "id"> => ({
  samitiId: input.samitiId,
  name: input.name,
  position: input.position,
  mobile: input.mobile,
  email: input.email,
  status: input.status,
});

const toUpdateData = (input: UpdateSamitiMemberDto): Prisma.SamitiMemberUncheckedUpdateInput => ({
  samitiId: input.samitiId,
  name: input.name,
  position: input.position,
  mobile: input.mobile,
  email: input.email,
  status: input.status,
});
