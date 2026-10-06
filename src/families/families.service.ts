import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { CreateFamilyDto, FamilyListQueryDto, UpdateFamilyDto } from "./dto/families.dto.js";
import { FamiliesRepository } from "./families.repository.js";
import { type FamilyVo, toFamilyVo } from "./vo/families.vo.js";

// Families are created by admins (or by approving an application) and changed only by
// admins. The member count follows the family's member rows (FamilyMembersRepository.recountFamilies).
@Injectable()
export class FamiliesService {
  constructor(private readonly repo: FamiliesRepository) {}

  async list(query: FamilyListQueryDto): Promise<FamilyVo[]> {
    const where: Prisma.FamilyWhereInput = { familyId: query.familyId, status: query.status };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toFamilyVo);
  }

  async create(dto: CreateFamilyDto): Promise<FamilyVo> {
    const row = await createWithDisplayId(
      "NPSI-FAM-",
      (prefix) => this.repo.latestDisplayIds(prefix),
      (familyId) => this.repo.create({ id: randomId(), familyId, ...toCreateData(dto) }),
    );
    return toFamilyVo(row);
  }

  async update(id: string, dto: UpdateFamilyDto): Promise<FamilyVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toFamilyVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateFamilyDto): Omit<Prisma.FamilyUncheckedCreateInput, "id" | "familyId"> => ({
  familyName: input.familyName,
  headName: input.headName,
  status: input.status,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  nativePlace: input.nativePlace,
  village: input.village,
  gotra: input.gotra,
  contactNumber: input.contactNumber,
  email: input.email,
  registrationDate: parseDate(input.registrationDate),
  applicationId: input.applicationId,
});

const toUpdateData = (input: UpdateFamilyDto): Prisma.FamilyUncheckedUpdateInput => ({
  familyName: input.familyName,
  headName: input.headName,
  status: input.status,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  nativePlace: input.nativePlace,
  village: input.village,
  gotra: input.gotra,
  contactNumber: input.contactNumber,
  email: input.email,
  registrationDate: parseDate(input.registrationDate),
  applicationId: input.applicationId,
});
