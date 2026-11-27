import { Injectable } from "@nestjs/common";
import { type AdminScope, adminScopeOf, OUTSIDE_VILLAGES, SUPER_ADMIN_SCOPE, villageAllowed } from "../common/admin-access/admin-scope.js";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { communityAccount } from "../common/eligibility/community-account.js";
import { loginAccount } from "../common/eligibility/login-account.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { isHeadRelationship, memberIdPrefix, nextMemberIds } from "../common/utils/member-ids.js";
import { pick } from "../common/utils/objects.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import { isMarried } from "../sagun/sagun.eligibility.js";
import type { CreateFamilyMemberDto, FamilyMemberListQueryDto, UpdateFamilyMemberDto } from "./dto/family-members.dto.js";
import { FamilyMembersRepository } from "./family-members.repository.js";
import { EDUCATION_FROM_8TH, educationNotAllowed } from "./member-rules.js";
import { type FamilyMemberVo, toFamilyMemberVo } from "./vo/family-members.vo.js";

// The fields the member's "my family" screen edits; the rest (status above all) is admin-only.
const MEMBER_FIELDS = [
  "name",
  "relationship",
  "gender",
  "dob",
  "mobile",
  "email",
  "education",
  "occupation",
  "schoolCollege",
  "companyName",
  "maritalStatus",
  "address",
] as const;

export const MEMBER_ELSEWHERE =
  "This mobile number or email already belongs to an active member of another family. To move them into your family, send a transfer request instead.";
// The head's own record stays the head: removing it or changing its relationship left families without a head (and
// without the head's birthday) in November 2026. Only an administrator changes who the head is.
export const HEAD_NOT_REMOVABLE = "The head of the family can't be removed. Ask an administrator if the head needs to change.";
export const HEAD_STAYS_HEAD = "The head of the family's relationship can't be changed. Ask an administrator if the head needs to change.";
export const ADMIN_EMAIL_MEMBER = "This email belongs to an administrator account and can't be added as a family member.";

// How a stored login mobile may be written (older rows keep the +91 / 0 the person typed).
const phoneSpellings = (mobile: string): string[] => [mobile, `+91${mobile}`, `+91 ${mobile}`, `+91-${mobile}`, `91${mobile}`, `0${mobile}`];
// A spouse, father or mother is married by the relationship itself (the rule Shagun Bandhan uses).
const impliesMarried = (relationship: string | null | undefined): boolean => isMarried({ maritalStatus: null, relationship });
const tenDigits = (value: string | null | undefined): string | null => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
};
const sameText = (a: string | null | undefined, b: string | null | undefined) => (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
// Members of a family. Admins manage all of them; a member may add, edit and
// remove the members of their own family. Every change recounts the families'
// member counts in the same transaction.
// A registered family (approved, so its ₹500 fee was verified) adds and edits its own members without an admin: they
// are ACTIVE at once (events, the card; Shagun only when the family ticks it for an eligible member). One exception
// stays with an admin: an email that is already another person's login. An ACTIVE member's email links that login to
// the family, so such a member waits as PENDING; a head can never pull someone else's account into their family.
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
      input = { ...pick(dto, MEMBER_FIELDS), familyId: ownFamilyId } as CreateFamilyMemberDto;
      assertNoMarkup(input);
      if (educationNotAllowed(input.relationship, input.education)) throw new ApiError(400, EDUCATION_FROM_8TH);
      if (impliesMarried(input.relationship)) input.maritalStatus = "MARRIED";
      await this.assertContactsFree(ownFamilyId, input, null);
      input.status = (await this.contactIsOutsideLogin(ownFamilyId, input, user)) ? "PENDING" : "ACTIVE";
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const [membershipId] = nextMemberIds(input.familyId, await this.repo.latestDisplayIds(memberIdPrefix(input.familyId), tx));
      const created = await this.repo.create({ id: randomId(), membershipId, ...toCreateData(input) }, tx);
      await this.repo.recountFamilies([created.familyId], tx);
      return created;
    });
    return toFamilyMemberVo(row);
  }

  // Admins only: each family's next member ids in order, all or nothing.
  async createBatch(records: CreateFamilyMemberDto[] | undefined): Promise<{ status: 200 | 201; records: FamilyMemberVo[] }> {
    if (!records?.length) return { status: 200, records: [] };
    const rows = await this.prisma.$transaction(async (tx) => {
      const ids = new Map<string, string[]>();
      for (const familyId of new Set(records.map((dto) => dto.familyId))) {
        const count = records.filter((dto) => dto.familyId === familyId).length;
        ids.set(familyId, nextMemberIds(familyId, await this.repo.latestDisplayIds(memberIdPrefix(familyId), tx), count));
      }
      const created = await this.repo.createMany(
        records.map((dto) => ({ id: randomId(), membershipId: ids.get(dto.familyId)?.shift() as string, ...toCreateData(dto) })),
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
      if (isHeadRelationship(member.relationship) && input.relationship !== undefined && !isHeadRelationship(input.relationship))
        throw new ApiError(403, HEAD_STAYS_HEAD);
      // Checked when the education or relationship changes (an older record keeps what it had until then).
      const relationship = input.relationship ?? member.relationship;
      const education = input.education !== undefined ? input.education : member.education;
      const educationTouched =
        (input.education !== undefined && !sameText(input.education, member.education)) ||
        (input.relationship !== undefined && !sameText(input.relationship, member.relationship));
      if (educationTouched && educationNotAllowed(relationship, education)) throw new ApiError(400, EDUCATION_FROM_8TH);
      if (impliesMarried(relationship)) input = { ...input, maritalStatus: "MARRIED" };
      await this.assertContactsFree(ownFamilyId, input, member.id);
      // A new email or mobile that is another person's login goes to an admin before the member counts again.
      const emailChanged = input.email !== undefined && !sameText(input.email, member.email);
      const mobileChanged = input.mobile !== undefined && tenDigits(input.mobile) !== tenDigits(member.mobile);
      const changed = { email: emailChanged ? input.email : null, mobile: mobileChanged ? input.mobile : null };
      if ((emailChanged || mobileChanged) && member.status !== "PENDING" && (await this.contactIsOutsideLogin(ownFamilyId, changed, user)))
        input = { ...input, status: "PENDING" };
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
  // Whether this email, or this mobile as someone's verified login, signs in to another person's account that is not
  // already part of this family. Such a member waits for an admin (PENDING): a head can't attach someone else's account
  // to their family (security finding 22). Logins of the same family (the head's own mobile on a child) are fine.
  private async contactIsOutsideLogin(familyId: string, input: { email?: string | null; mobile?: string | null }, user: UserRow): Promise<boolean> {
    const email = input.email?.trim().toLowerCase() || null;
    const mobile = tenDigits(input.mobile);
    const contact: Prisma.UserWhereInput[] = [
      ...(email && !sameText(email, user.email) ? [{ email }] : []),
      ...(mobile ? [{ phone: { in: phoneSpellings(mobile) }, phoneVerified: true }] : []),
    ];
    if (!contact.length) return false;
    const logins = await this.prisma.user.findMany({ where: { OR: contact, id: { not: user.id } }, take: 5 });
    for (const login of logins) {
      if ((await communityAccount(this.prisma, login))?.familyId !== familyId) return true;
    }
    return false;
  }

  private async assertContactsFree(familyId: string, input: { mobile?: string | null; email?: string | null }, memberId: string | null): Promise<void> {
    const mobile = tenDigits(input.mobile);
    // Lower-cased like the stored values, so an upper-case copy of an address can't slip past these checks.
    const email = input.email?.trim().toLowerCase() || null;
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
      if (isHeadRelationship(member.relationship)) throw new ApiError(403, HEAD_NOT_REMOVABLE);
    }
    await this.prisma.$transaction(async (tx) => {
      const member = await this.repo.findById(id, tx);
      await this.repo.delete(id, tx);
      await this.repo.recountFamilies([member?.familyId], tx);
      // A transfer request for a member who no longer exists can't be decided: it is closed (security finding 30).
      if (member?.membershipId) {
        await tx.transferRequest.updateMany({
          where: { sourceMembershipId: member.membershipId, status: { in: ["PENDING", "CORRECTION_REQUIRED"] } },
          data: { status: "REJECTED", openKey: null, adminRemarks: "Closed automatically: the member was removed from the family." },
        });
      }
    });
  }
}
// Free text: trimmed, single spaces, and empty means "not given" (null); not sent stays undefined (unchanged).
const freeText = (value: string | null | undefined) => (value == null ? value : value.replace(/\s+/g, " ").trim() || null);
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
  schoolCollege: freeText(input.schoolCollege),
  companyName: freeText(input.companyName),
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
  schoolCollege: freeText(input.schoolCollege),
  companyName: freeText(input.companyName),
  maritalStatus: input.maritalStatus,
  address: input.address,
  photoUrl: input.photoUrl,
  status: input.status,
  linkedStudentId: input.linkedStudentId,
});
