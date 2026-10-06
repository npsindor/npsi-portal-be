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
import type { CreateTransferRequestDto, TransferRequestListQueryDto, UpdateTransferRequestDto } from "./dto/transfer-requests.dto.js";
import { TransferRequestsRepository } from "./transfer-requests.repository.js";
import { type TransferRequestVo, toTransferRequestVo } from "./vo/transfer-requests.vo.js";

// The fields the member's transfer request form sends; the rest is admin-only.
const MEMBER_FIELDS = [
  "requestType",
  "status",
  "requesterName",
  "requesterEmail",
  "requesterMobile",
  "sourceStudentId",
  "sourceMembershipId",
  "sourceFamilyId",
  "targetFamilyId",
  "targetFamilyName",
  "reason",
  "requesterId",
  "requestedDate",
] as const;
// Requests to move a member or student to another family. Members may only
// ask for their own records; requests always start PENDING for admins.
@Injectable()
export class TransferRequestsService {
  constructor(
    private readonly repo: TransferRequestsRepository,
    private readonly membership: MembershipRepository,
  ) {}

  async list(query: TransferRequestListQueryDto): Promise<TransferRequestVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toTransferRequestVo);
  }

  async create(dto: CreateTransferRequestDto, user: UserRow): Promise<TransferRequestVo> {
    const input: CreateTransferRequestDto = user.role === "admin" ? { ...dto } : pick(dto, MEMBER_FIELDS);
    if (user.role !== "admin") {
      assertNoMarkup(input);
      await this.applyMemberRules(input, user);
    }
    const row = await createWithDisplayId(
      "TRF-",
      (prefix) => this.repo.latestDisplayIds(prefix),
      (requestId) => this.repo.create({ id: randomId(), requestId, ...toCreateData(input) }),
    );
    return toTransferRequestVo(row);
  }

  async update(id: string, dto: UpdateTransferRequestDto): Promise<TransferRequestVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toTransferRequestVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  private async applyMemberRules(input: CreateTransferRequestDto, user: UserRow): Promise<void> {
    const ownFamilyId = await this.membership.ownFamilyId(user);
    if (input.sourceFamilyId && input.sourceFamilyId !== ownFamilyId) throw new ApiError(403, "You can only request a transfer for your own family.");
    if (input.sourceMembershipId) {
      const familyId = await this.membership.familyIdOfMembership(input.sourceMembershipId);
      if (!familyId || familyId !== ownFamilyId) throw new ApiError(403, "You can only request a transfer for a member of your own family.");
    }
    if (input.sourceStudentId) {
      const student = await this.membership.studentOwner(input.sourceStudentId);
      const ownEmail = (user.email ?? "").toLowerCase();
      const isOwn = student && ((student.email && student.email.toLowerCase() === ownEmail) || (ownFamilyId && student.linkedFamilyId === ownFamilyId));
      if (!isOwn) throw new ApiError(403, "You can only request a transfer for your own student record.");
    }
    Object.assign(input, { requesterId: user.id, status: "PENDING" });
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: CreateTransferRequestDto): Omit<Prisma.TransferRequestUncheckedCreateInput, "id" | "requestId"> => ({
  requestType: input.requestType,
  status: input.status,
  reason: input.reason,
  sourceStudentId: input.sourceStudentId,
  sourceMembershipId: input.sourceMembershipId,
  sourceFamilyId: input.sourceFamilyId,
  targetFamilyId: input.targetFamilyId,
  requesterId: input.requesterId,
  adminRemarks: input.adminRemarks,
  approvedById: input.approvedById,
  approvedDate: parseDate(input.approvedDate),
  resultingMembershipId: input.resultingMembershipId,
  oldFamilyId: input.oldFamilyId,
  newFamilyId: input.newFamilyId,
  requesterName: input.requesterName,
  requesterEmail: input.requesterEmail,
  requesterMobile: input.requesterMobile,
  targetFamilyName: input.targetFamilyName,
  requestedDate: parseDate(input.requestedDate),
});

const toUpdateData = (input: UpdateTransferRequestDto): Prisma.TransferRequestUncheckedUpdateInput => ({
  requestType: input.requestType,
  status: input.status,
  reason: input.reason,
  sourceStudentId: input.sourceStudentId,
  sourceMembershipId: input.sourceMembershipId,
  sourceFamilyId: input.sourceFamilyId,
  targetFamilyId: input.targetFamilyId,
  requesterId: input.requesterId,
  adminRemarks: input.adminRemarks,
  approvedById: input.approvedById,
  approvedDate: parseDate(input.approvedDate),
  resultingMembershipId: input.resultingMembershipId,
  oldFamilyId: input.oldFamilyId,
  newFamilyId: input.newFamilyId,
  requesterName: input.requesterName,
  requesterEmail: input.requesterEmail,
  requesterMobile: input.requesterMobile,
  targetFamilyName: input.targetFamilyName,
  requestedDate: parseDate(input.requestedDate),
  updatedAt: new Date(),
});
