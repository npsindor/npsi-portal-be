import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId, displayIdAt, nextDisplayId } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import type { CreateFamilyMemberDto, FamilyMemberListQueryDto, UpdateFamilyMemberDto } from "./dto/family-members.dto.js";
import { FamilyMembersRepository } from "./family-members.repository.js";
import { type FamilyMemberVo, toFamilyMemberVo } from "./vo/family-members.vo.js";

const PREFIX = "NPSI-MEM-";

// The fields the member's "my family" screen edits; the rest is admin-only.
const MEMBER_FIELDS = ["name", "relationship", "gender", "dob", "mobile", "email", "education", "occupation", "address", "status"] as const;
// Members of a family. Admins manage all of them; a member may add, edit and
// remove the members of their own family. Every change recounts the families'
// member counts in the same transaction.
@Injectable()
export class FamilyMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FamilyMembersRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async list(query: FamilyMemberListQueryDto): Promise<FamilyMemberVo[]> {
    const where: Prisma.FamilyMemberWhereInput = { familyId: query.familyId };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toFamilyMemberVo);
  }

  async create(dto: CreateFamilyMemberDto, user: UserRow): Promise<FamilyMemberVo> {
    let input = dto;
    if (user.role !== "admin") {
      const ownFamilyId = await this.membership.ownFamilyId(user);
      if (!ownFamilyId || dto.familyId !== ownFamilyId) throw new ApiError(403, "You can only add members to your own family.");
      input = { ...pick(dto, MEMBER_FIELDS), familyId: ownFamilyId } as CreateFamilyMemberDto;
      assertNoMarkup(input);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await createWithDisplayId(
        PREFIX,
        (prefix) => this.repo.latestDisplayIds(prefix, tx),
        (membershipId) => this.repo.create({ id: randomId(), membershipId, ...toCreateData(input) }, tx),
      );
      await this.repo.recountFamilies([created.familyId], tx);
      return created;
    });
    return toFamilyMemberVo(row);
  }

  // Admins only: consecutive membership ids, all or nothing.
  async createBatch(records: CreateFamilyMemberDto[] | undefined): Promise<{ status: 200 | 201; records: FamilyMemberVo[] }> {
    if (!records?.length) return { status: 200, records: [] };
    const first = Number(nextDisplayId(PREFIX, await this.repo.latestDisplayIds(PREFIX)).slice(PREFIX.length));
    const rows = await this.prisma.$transaction(async (tx) => {
      const created = await this.repo.createMany(
        records.map((dto, index) => ({ id: randomId(), membershipId: displayIdAt(PREFIX, first + index), ...toCreateData(dto) })),
        tx,
      );
      await this.repo.recountFamilies(
        created.map((row) => row.familyId),
        tx,
      );
      return created;
    });
    return { status: 201, records: rows.map(toFamilyMemberVo) };
  }

  async update(id: string, dto: UpdateFamilyMemberDto, user: UserRow): Promise<FamilyMemberVo> {
    let input: UpdateFamilyMemberDto = dto;
    if (user.role !== "admin") {
      const ownFamilyId = await this.membership.ownFamilyId(user);
      if (!ownFamilyId) throw new ApiError(403, "No family found for your account.");
      const member = await this.repo.findById(id);
      if (!member || member.familyId !== ownFamilyId) throw new ApiError(403, "You can only update members of your own family.");
      input = pick(dto, MEMBER_FIELDS);
      assertNoMarkup(input);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const fromFamilyId = (await this.repo.findById(id, tx))?.familyId;
      const updated = await this.repo.update(id, toUpdateData(input), tx);
      // An admin may move a member to another family: both counts change.
      if (updated && fromFamilyId !== updated.familyId) await this.repo.recountFamilies([fromFamilyId, updated.familyId], tx);
      return updated;
    });
    if (!row) throw new ApiError(404, "Record not found");
    return toFamilyMemberVo(row);
  }

  async remove(id: string, user: UserRow): Promise<void> {
    if (user.role !== "admin") {
      const ownFamilyId = await this.membership.ownFamilyId(user);
      const member = await this.repo.findById(id);
      if (!ownFamilyId || !member || member.familyId !== ownFamilyId) throw new ApiError(403, "You can only remove members of your own family.");
    }
    await this.prisma.$transaction(async (tx) => {
      const member = await this.repo.findById(id, tx);
      await this.repo.delete(id, tx);
      await this.repo.recountFamilies([member?.familyId], tx);
    });
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateFamilyMemberDto): Omit<Prisma.FamilyMemberUncheckedCreateInput, "id" | "membershipId"> => ({
  familyId: input.familyId,
  name: input.name,
  relationship: input.relationship,
  gender: input.gender,
  dob: parseDate(input.dob),
  mobile: input.mobile,
  email: input.email,
  education: input.education,
  occupation: input.occupation,
  address: input.address,
  photoUrl: input.photoUrl,
  status: input.status,
  linkedStudentId: input.linkedStudentId,
});

const toUpdateData = (input: UpdateFamilyMemberDto): Prisma.FamilyMemberUncheckedUpdateInput => ({
  familyId: input.familyId,
  name: input.name,
  relationship: input.relationship,
  gender: input.gender,
  dob: parseDate(input.dob),
  mobile: input.mobile,
  email: input.email,
  education: input.education,
  occupation: input.occupation,
  address: input.address,
  photoUrl: input.photoUrl,
  status: input.status,
  linkedStudentId: input.linkedStudentId,
});
