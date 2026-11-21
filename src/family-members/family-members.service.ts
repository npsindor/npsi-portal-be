import { Injectable } from "@nestjs/common";
import { type AdminScope, adminScopeOf, OUTSIDE_VILLAGES, SUPER_ADMIN_SCOPE, villageAllowed } from "../common/admin-access/admin-scope.js";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { loginAccount } from "../common/eligibility/login-account.js";
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

// The fields the member's "my family" screen edits; the rest (status above all) is admin-only.
const MEMBER_FIELDS = ["name", "relationship", "gender", "dob", "mobile", "email", "education", "occupation", "maritalStatus", "address"] as const;

export const MEMBER_ELSEWHERE =
  "This mobile number or email already belongs to an active member of another family. To move them into your family, send a transfer request instead.";
export const ADMIN_EMAIL_MEMBER = "This email belongs to an administrator account and can't be added as a family member.";

const tenDigits = (value: string | null | undefined): string | null => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};
const sameText = (a: string | null | undefined, b: string | null | undefined) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
// Members of a family. Admins manage all of them; a member may add, edit and
// remove the members of their own family. Every change recounts the families'
// member counts in the same transaction.
// A member added (or whose mobile / email is changed) by the family head waits as PENDING until an admin approves
// it: only ACTIVE members count for event registration, Shagun, the verification card, and for linking a login
// account to the family by email. So a head can neither activate unverified people nor pull someone else's account
// into their family.
// A Student account is only the student: it has no family, so it can't add family members.
export const STUDENT_NO_MEMBERS = "A student account can't add family members. Student registration is for the student only.";

@Injectable()
export class FamilyMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: FamilyMembersRepository,
    private readonly membership: MembershipRepository,
  ) {}

  // A staff member lists one family's members at a time, and only for a family of their villages.
  async list(query: FamilyMemberListQueryDto, scope: AdminScope = SUPER_ADMIN_SCOPE): Promise<FamilyMemberVo[]> {
    if (!scope.allVillages) {
      const family = query.familyId
        ? await this.prisma.family.findFirst({ where: { familyId: query.familyId }, select: { village: true, nativePlace: true } })
        : null;
      if (!family || !villageAllowed(scope, family.village, family.nativePlace)) throw new ApiError(403, OUTSIDE_VILLAGES);
    }
    const where: Prisma.FamilyMemberWhereInput = { familyId: query.familyId };
    const rows = await this.repo.list(where, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toFamilyMemberVo);
  }

  async create(dto: CreateFamilyMemberDto, user: UserRow): Promise<FamilyMemberVo> {
    let input = dto;
    if (user.role !== "admin") {
      const ownFamilyId = await this.membership.ownFamilyId(user);
      if (!ownFamilyId && (await loginAccount(this.prisma, user)).type === "STUDENT") throw new ApiError(403, STUDENT_NO_MEMBERS);
      if (!ownFamilyId || dto.familyId !== ownFamilyId) throw new ApiError(403, "You can only add members to your own family.");
      input = { ...pick(dto, MEMBER_FIELDS), familyId: ownFamilyId, status: "PENDING" } as CreateFamilyMemberDto;
      assertNoMarkup(input);
      await this.assertContactsFree(ownFamilyId, input, null);
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
    // A staff member with family access approves (or deactivates) members of their villages' families: status only.
    const staff = user.role !== "admin" ? await this.staffStatusChange(id, dto, user) : null;
    if (staff) input = { status: dto.status };
    else if (user.role !== "admin") {
      const ownFamilyId = await this.membership.ownFamilyId(user);
      if (!ownFamilyId) throw new ApiError(403, "No family found for your account.");
      const member = await this.repo.findById(id);
      if (!member || member.familyId !== ownFamilyId) throw new ApiError(403, "You can only update members of your own family.");
      input = pick(dto, MEMBER_FIELDS);
      assertNoMarkup(input);
      await this.assertContactsFree(ownFamilyId, input, member.id);
      // A new mobile or email on an approved member goes back to an admin before it counts again.
      const contactChanged =
        (input.mobile !== undefined && tenDigits(input.mobile) !== tenDigits(member.mobile)) ||
        (input.email !== undefined && !sameText(input.email, member.email));
      if (contactChanged && member.status !== "PENDING") input = { ...input, status: "PENDING" };
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

  // { status } alone, from a staff member whose FAMILIES access covers this member's family: allowed (true). Any other
  // change from them goes through the normal own-family rules.
  private async staffStatusChange(id: string, dto: UpdateFamilyMemberDto, user: UserRow): Promise<boolean> {
    const keys = Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (keys.length !== 1 || keys[0] !== "status") return false;
    const scope = await adminScopeOf(this.prisma, user);
    if (!scope?.areas.includes("FAMILIES")) return false;
    const member = await this.repo.findById(id);
    if (!member) throw new ApiError(404, "Record not found");
    const family = await this.prisma.family.findFirst({ where: { familyId: member.familyId }, select: { village: true, nativePlace: true } });
    if (!family || !villageAllowed(scope, family.village, family.nativePlace)) throw new ApiError(403, OUTSIDE_VILLAGES);
    return true;
  }

  // A head may not add a person who is already an active member of another family (that is a transfer), nor an
  // administrator's email.
  private async assertContactsFree(familyId: string, input: { mobile?: string | null; email?: string | null }, memberId: string | null): Promise<void> {
    const mobile = tenDigits(input.mobile);
    const email = input.email?.trim() || null;
    if (email && (await this.prisma.user.findFirst({ where: { email, role: "admin" }, select: { id: true } }))) throw new ApiError(409, ADMIN_EMAIL_MEMBER);
    const contact: Prisma.FamilyMemberWhereInput[] = [...(mobile ? [{ mobileDigits: mobile }] : []), ...(email ? [{ email }] : [])];
    if (!contact.length) return;
    const elsewhere = await this.prisma.familyMember.findFirst({
      where: { OR: contact, status: { in: ["ACTIVE", "Active", "APPROVED"] }, familyId: { not: familyId }, ...(memberId ? { id: { not: memberId } } : {}) },
      select: { id: true },
    });
    if (elsewhere) throw new ApiError(409, MEMBER_ELSEWHERE);
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
  maritalStatus: input.maritalStatus,
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
  maritalStatus: input.maritalStatus,
  address: input.address,
  photoUrl: input.photoUrl,
  status: input.status,
  linkedStudentId: input.linkedStudentId,
});
