import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId, isUniqueViolation } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { pick } from "../common/utils/objects.js";
import { PrismaService } from "../database/prisma.service.js";
import { FamiliesRepository } from "../families/families.repository.js";
import type { Prisma } from "../generated/prisma/client.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import type { CreateTransferRequestDto, TransferRequestListQueryDto, UpdateTransferRequestDto } from "./dto/transfer-requests.dto.js";
import { TransferRequestsRepository } from "./transfer-requests.repository.js";
import { type TransferRequestVo, toTransferRequestVo } from "./vo/transfer-requests.vo.js";

// The fields the member's transfer request form sends; the requester (name, email, mobile, id), the source family,
// the status and the dates are the server's.
const MEMBER_FIELDS = ["requestType", "sourceStudentId", "sourceMembershipId", "targetFamilyId", "targetFamilyName", "reason"] as const;

const PREFIX = "TRF-";
const OPEN = ["PENDING", "CORRECTION_REQUIRED"];
// A member files at most this many transfer requests per hour.
const HOURLY_LIMIT = 5;

export const alreadyRequested = (requestId: string) => `A transfer request for this member is already pending (${requestId}) and is under admin review.`;

// "M:<membership id>" / "S:<student id>": who the request is about, for the one-open-request-per-person key.
export const openKeyOf = (input: { requestType?: string | null; sourceMembershipId?: string | null; sourceStudentId?: string | null }): string | null => {
  if (input.requestType === "student_to_family") return input.sourceStudentId ? `S:${input.sourceStudentId}` : null;
  return input.sourceMembershipId ? `M:${input.sourceMembershipId}` : null;
};

// Requests to move a member or student to another family. Members may only ask for their own records, to another
// ACTIVE family; requests always start PENDING for admins, and the target family is notified in the same
// transaction. One person has at most one open request at a time (database-enforced), reference numbers are never
// reused, and the requester's details come from the session, not the form.
@Injectable()
export class TransferRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: TransferRequestsRepository,
    private readonly membership: MembershipRepository,
    private readonly families: FamiliesRepository,
    private readonly notifications: NotificationsRepository,
  ) {}

  async list(query: TransferRequestListQueryDto): Promise<TransferRequestVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    return rows.map(toTransferRequestVo);
  }

  async create(dto: CreateTransferRequestDto, user: UserRow): Promise<TransferRequestVo> {
    const { lang, ...body } = dto;
    const isMember = user.role !== "admin";
    const input: Omit<CreateTransferRequestDto, "lang"> = isMember ? pick(body, MEMBER_FIELDS) : body;
    if (isMember) {
      assertNoMarkup(input);
      await this.applyMemberRules(input, user);
    }
    const openKey = OPEN.includes(input.status ?? "PENDING") ? openKeyOf(input) : null;
    if (openKey) {
      const open = await this.repo.findOpen(openKey);
      if (open) throw new ApiError(409, alreadyRequested(open.requestId));
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (isMember && input.targetFamilyId && !(await this.families.findByFamilyId(input.targetFamilyId, tx, "ACTIVE"))) {
          throw new ApiError(404, "Target family not found.");
        }
        const request = await createWithDisplayId(
          PREFIX,
          (prefix) => this.repo.latestDisplayIds(prefix, tx),
          (requestId) => this.repo.create({ id: randomId(), requestId, ...toCreateData(input), openKey }, tx),
        );
        await this.repo.recordDisplayId(PREFIX, request.requestId, tx);
        if (isMember && request.targetFamilyId) {
          await this.notifications.create(workflowNotification("transferRequested", request.targetFamilyId, { requestId: request.requestId }, lang), tx);
        }
        return request;
      });
      return toTransferRequestVo(row);
    } catch (error) {
      // Two simultaneous requests for one person: the open-request key lets only one through.
      if (openKey && isUniqueViolation(error)) {
        const open = await this.repo.findOpen(openKey);
        if (open) throw new ApiError(409, alreadyRequested(open.requestId));
      }
      throw error;
    }
  }

  // Admin corrections to a request's details. The decision itself (and moving the member) is POST …/review only,
  // so a status sent here is ignored.
  async update(id: string, dto: UpdateTransferRequestDto): Promise<TransferRequestVo> {
    const row = await this.repo.update(id, { ...toUpdateData(dto), status: undefined });
    if (!row) throw new ApiError(404, "Record not found");
    return toTransferRequestVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  // family_to_family: a member of the requester's own family, to another family. student_to_family: the requester's
  // own student record, into a family. Anything else is a 400 before it reaches the admin queue.
  private async applyMemberRules(input: Omit<CreateTransferRequestDto, "lang">, user: UserRow): Promise<void> {
    if ((await this.repo.countByRequesterSince(user.id, new Date(Date.now() - 60 * 60 * 1000))) >= HOURLY_LIMIT) {
      throw new ApiError(429, "Too many transfer requests. Please try again later.");
    }
    const ownFamilyId = await this.membership.ownFamilyId(user);
    if (!input.targetFamilyId?.trim()) throw new ApiError(400, "Choose the family to transfer to.");
    if (!(await this.families.findByFamilyId(input.targetFamilyId, undefined, "ACTIVE"))) throw new ApiError(404, "Target family not found.");
    if (input.requestType === "family_to_family") {
      if (!input.sourceMembershipId?.trim()) throw new ApiError(400, "Choose the family member to transfer.");
      const familyId = await this.membership.familyIdOfMembership(input.sourceMembershipId);
      if (!ownFamilyId || familyId !== ownFamilyId) throw new ApiError(403, "You can only request a transfer for a member of your own family.");
      if (input.targetFamilyId === ownFamilyId) throw new ApiError(400, "The member is already in this family.");
      Object.assign(input, { sourceFamilyId: ownFamilyId, sourceStudentId: null });
    } else {
      if (!input.sourceStudentId?.trim()) throw new ApiError(400, "Choose the student record to transfer.");
      const student = await this.membership.studentOwner(input.sourceStudentId);
      const ownEmail = (user.email ?? "").toLowerCase();
      const isOwn = student && ((student.email && student.email.toLowerCase() === ownEmail) || (ownFamilyId && student.linkedFamilyId === ownFamilyId));
      if (!isOwn) throw new ApiError(403, "You can only request a transfer for your own student record.");
      Object.assign(input, { sourceFamilyId: null, sourceMembershipId: null });
    }
    Object.assign(input, {
      requesterId: user.id,
      requesterName: user.fullName || user.email || user.phone || null,
      requesterEmail: user.email,
      requesterMobile: user.phone,
      requestedDate: new Date().toISOString(),
      status: "PENDING",
    });
  }
}
// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
const toCreateData = (input: Omit<CreateTransferRequestDto, "lang">): Omit<Prisma.TransferRequestUncheckedCreateInput, "id" | "requestId"> => ({
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
});
