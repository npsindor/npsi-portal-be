import { Injectable } from "@nestjs/common";
import { type ReviewDto, reviewRemarks } from "../common/dto/review.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import { FamiliesRepository } from "../families/families.repository.js";
import { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import type { Family, Prisma, TransferRequest } from "../generated/prisma/client.js";
import type { Lang } from "../notifications/notification-texts.js";
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { StudentsRepository } from "../students/students.repository.js";
import { TransferRequestsRepository } from "./transfer-requests.repository.js";
import { type TransferRequestVo, toTransferRequestVo } from "./vo/transfer-requests.vo.js";

// An admin's decision on a transfer request, in one transaction. Approving
// moves the member to the target family (family_to_family), or adds the student
// to it as a new member (student_to_family); both families' member counts
// follow, and the target family is notified. Rejecting or asking for a
// correction (remarks required) records the decision.
@Injectable()
export class TransferRequestReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requests: TransferRequestsRepository,
    private readonly families: FamiliesRepository,
    private readonly familyMembers: FamilyMembersRepository,
    private readonly students: StudentsRepository,
    private readonly notifications: NotificationsRepository,
  ) {}

  async review(id: string, dto: ReviewDto, admin: UserRow): Promise<TransferRequestVo> {
    const remarks = reviewRemarks(dto, (message) => new ApiError(400, message));
    const row = await this.prisma.$transaction(async (tx) => {
      const request = await this.requests.findById(id, tx);
      if (!request) throw new ApiError(404, "Transfer request not found.");
      if (request.status === "APPROVED") throw new ApiError(409, "This transfer request has already been approved.");
      const decided: Prisma.TransferRequestUncheckedUpdateInput = { adminRemarks: remarks, approvedById: admin.id };
      if (dto.decision !== "APPROVED") return this.requests.update(id, { ...decided, status: dto.decision }, tx);
      const target = request.targetFamilyId ? await this.families.findByFamilyId(request.targetFamilyId, tx, "ACTIVE") : null;
      if (!target) throw new ApiError(404, "Target family not found.");
      const moved =
        request.requestType === "student_to_family"
          ? await this.addStudent(request, target, tx, dto.lang)
          : await this.moveMember(request, target, tx, dto.lang);
      return this.requests.update(id, { ...decided, ...moved, status: "APPROVED", approvedDate: new Date(), newFamilyId: target.familyId }, tx);
    });
    return toTransferRequestVo(row as TransferRequest);
  }

  private async addStudent(request: TransferRequest, target: Family, tx: Db, lang?: Lang): Promise<Prisma.TransferRequestUncheckedUpdateInput> {
    const student = request.sourceStudentId ? await this.students.findByStudentId(request.sourceStudentId, tx) : null;
    if (!student) throw new ApiError(404, "Source student not found.");
    const familyId = target.familyId as string;
    if (await this.familyMembers.hasContactInFamily(familyId, student.mobile, student.email, tx)) {
      throw new ApiError(409, "This person is already a member of the target family.");
    }
    const member = await createWithDisplayId(
      "NPSI-MEM-",
      (prefix) => this.familyMembers.latestDisplayIds(prefix, tx),
      (membershipId) =>
        this.familyMembers.create(
          {
            id: randomId(),
            membershipId,
            familyId,
            name: student.studentName,
            relationship: "Other",
            gender: student.gender,
            dob: student.dob,
            mobile: student.mobile,
            email: student.email,
            address: student.address,
            photoUrl: student.photoUrl,
            status: "ACTIVE",
            linkedStudentId: student.studentId,
          },
          tx,
        ),
    );
    await this.students.update(student.id, { status: "TRANSFERRED", linkedFamilyId: familyId, linkedMembershipId: member.membershipId }, tx);
    await this.familyMembers.recountFamilies([familyId], tx);
    const vars = { familyName: target.familyName, membershipId: member.membershipId };
    await this.notifications.create(workflowNotification("transferApproved", familyId, vars, lang), tx);
    return { resultingMembershipId: member.membershipId };
  }

  private async moveMember(request: TransferRequest, target: Family, tx: Db, lang?: Lang): Promise<Prisma.TransferRequestUncheckedUpdateInput> {
    const member = request.sourceMembershipId ? await this.familyMembers.findByMembershipId(request.sourceMembershipId, tx) : null;
    if (!member) throw new ApiError(404, "Source member not found.");
    const fromFamilyId = member.familyId;
    await this.familyMembers.update(member.id, { familyId: target.familyId as string, status: "ACTIVE" }, tx);
    await this.familyMembers.recountFamilies([fromFamilyId, target.familyId], tx);
    const vars = { fromFamilyId, toFamilyName: target.familyName };
    await this.notifications.create(workflowNotification("transferMoved", target.familyId as string, vars, lang), tx);
    return { oldFamilyId: fromFamilyId };
  }
}
