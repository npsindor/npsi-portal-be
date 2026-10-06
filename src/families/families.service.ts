import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import type { CreateFamilyDto, FamilyListQueryDto, UpdateFamilyDto } from "./dto/families.dto.js";
import { FamiliesRepository } from "./families.repository.js";
import { type FamilyVo, toFamilyVo } from "./vo/families.vo.js";

// What a member may change on their own family (the member count, kept in
// step when they add or remove members); everything else is admin-only.
const MEMBER_FIELDS = ["memberCount"] as const;
// Families are created by admins (when approving an application); members may
// only adjust their own family's member count.
@Injectable()
export class FamiliesService {
  constructor(
    private readonly repo: FamiliesRepository,
    private readonly membership: MembershipRepository,
  ) {}

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

  async update(id: string, dto: UpdateFamilyDto, user: UserRow): Promise<FamilyVo> {
    let input: UpdateFamilyDto = dto;
    if (user.role !== "admin") {
      const ownFamilyId = await this.membership.ownFamilyId(user);
      if (!ownFamilyId) throw new ApiError(403, "No family found for your account.");
      const family = await this.repo.findById(id);
      if (!family || family.familyId !== ownFamilyId) throw new ApiError(403, "You can only update your own family.");
      input = pick(dto, MEMBER_FIELDS);
      assertNoMarkup(input);
    }
    const row = await this.repo.update(id, toUpdateData(input));
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
  memberCount: input.memberCount,
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
  memberCount: input.memberCount,
  applicationId: input.applicationId,
});
