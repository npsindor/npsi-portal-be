import { Injectable } from "@nestjs/common";
import { AuthService } from "../auth/auth.service.js";
import { type AdminScope, OUTSIDE_VILLAGES, SUPER_ADMIN_SCOPE, villageAllowed } from "../common/admin-access/admin-scope.js";
import { type ReviewDto, reviewRemarks } from "../common/dto/review.dto.js";
import { ApiError } from "../common/filters/api-error.js";
import { ApplicantNotifier, type Outbound } from "../common/messaging/applicant-notifier.service.js";
import { randomId } from "../common/utils/crypto.js";
import { createWithDisplayId, displayIdAt, nextDisplayId } from "../common/utils/display-ids.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import { FamiliesRepository } from "../families/families.repository.js";
import { toFamilyVo } from "../families/vo/families.vo.js";
import { FamilyMembersRepository } from "../family-members/family-members.repository.js";
import { toFamilyMemberVo } from "../family-members/vo/family-members.vo.js";
import type { Application, Family, FamilyMember } from "../generated/prisma/client.js";
import { asLang, type NotificationKey, userNotification, workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { assertFeeSettled } from "../registrations/registration.rules.js";
import { StudentsRepository } from "../students/students.repository.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import { ApplicationsRepository } from "./applications.repository.js";
import { applicationMembers, dateOnly, text } from "./members-data.js";
import type { ApplicationReviewVo } from "./vo/application-review.vo.js";
import { toApplicationVo } from "./vo/applications.vo.js";

const MEMBER_PREFIX = "NPSI-MEM-";

// An admin's decision on a family registration application, all in one
// transaction. Approving creates the ACTIVE family and its members from the
// application, marks it APPROVED and notifies the new family; the applicant is
// then invited to the portal (best effort, after the commit). Rejecting or
// asking for a correction records the remarks and notifies the applicant.
@Injectable()
export class ApplicationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsRepository,
    private readonly families: FamiliesRepository,
    private readonly familyMembers: FamilyMembersRepository,
    private readonly notifications: NotificationsRepository,
    private readonly auth: AuthService,
    private readonly transactions: TransactionsRepository,
    private readonly notifier: ApplicantNotifier,
    private readonly students: StudentsRepository,
  ) {}

  // scope: the reviewer's admin access (a staff member may only decide registrations from their villages).
  async review(id: string, dto: ReviewDto, scope: AdminScope = SUPER_ADMIN_SCOPE): Promise<ApplicationReviewVo> {
    const remarks = reviewRemarks(dto, (message) => new ApiError(400, message));
    let outbound: Outbound | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const application = await this.applications.findById(id, tx);
      if (!application) throw new ApiError(404, "Application not found.");
      if (!villageAllowed(scope, application.village, application.nativePlace)) throw new ApiError(403, OUTSIDE_VILLAGES);
      if (application.status === "APPROVED") throw new ApiError(409, "This application has already been approved.");
      // The applicant's own language when they gave one (account-first registrations), else the admin's.
      const lang = application.lang ? asLang(application.lang) : (dto.lang ?? "en");
      const notify = (key: NotificationKey, vars: Record<string, string | null | undefined>) => {
        outbound = { key, vars, lang, name: application.familyHeadName, email: application.email, mobile: application.mobile };
        return application.userId ? this.notifications.create(userNotification(key, application.userId, vars, lang), tx) : null;
      };
      if (dto.decision !== "APPROVED") {
        const updated = await this.applications.update(id, { status: dto.decision, adminRemarks: remarks, reviewedDate: new Date() }, tx);
        const key = dto.decision === "REJECTED" ? "applicationRejected" : "applicationCorrection";
        if (!application.userId) await this.notifications.create(workflowNotification(key, application.applicationId, { remarks }, lang), tx);
        await notify(key, { remarks });
        return { application: updated as Application, family: null, members: [] };
      }
      const fee = await this.transactions.feeFor(application.applicationId, tx);
      if (fee) assertFeeSettled(fee.paymentStatus);
      const { family, members } = await this.createFamily(application, tx);
      await this.moveStudentIntoFamily(application, family, members, tx);
      if (fee) await this.transactions.update(fee.id, { familyId: family.familyId }, tx);
      const updated = await this.applications.update(
        id,
        { status: "APPROVED", adminRemarks: remarks ?? undefined, reviewedDate: new Date(), resultingFamilyId: family.familyId },
        tx,
      );
      await this.notifications.create(workflowNotification("applicationApproved", family.familyId as string, { familyId: family.familyId }, lang), tx);
      await notify("applicationApproved", { familyId: family.familyId });
      return { application: updated as Application, family, members };
    });
    // Account-first applicants already have a login: they get the status message, not an invitation.
    const viaAccount = Boolean(result.application.userId);
    if (outbound && (viaAccount || !result.family)) await this.notifier.deliver([outbound]);
    if (result.family && !viaAccount && result.application.email) {
      const email = result.application.email;
      await this.auth
        .invite({ email, role: "user", fullName: result.application.familyHeadName, phone: result.application.mobile ?? undefined })
        .then(() => this.applications.linkToAccount(result.application.id, email))
        .catch((error: unknown) => console.error("[approval] invite failed:", error instanceof Error ? error.message : error));
    }
    return {
      application: toApplicationVo(result.application),
      family: result.family ? toFamilyVo(result.family) : null,
      members: result.members.map(toFamilyMemberVo),
    };
  }

  // A student who registers as a member (₹500) becomes the new family's head: the student record is kept for
  // the admin but marked TRANSFERRED and linked to that member, so the account now uses the family portal only.
  private async moveStudentIntoFamily(application: Application, family: Family, members: FamilyMember[], tx: Db): Promise<void> {
    if (!application.userId) return;
    const student = await this.students.activeForUser(application.userId, tx);
    const head = members[0];
    if (!student || !head) return;
    await this.familyMembers.update(head.id, { linkedStudentId: student.studentId }, tx);
    await this.students.update(student.id, { status: "TRANSFERRED", linkedFamilyId: family.familyId, linkedMembershipId: head.membershipId }, tx);
  }

  private async createFamily(application: Application, tx: Db): Promise<{ family: Family; members: FamilyMember[] }> {
    const listed = applicationMembers(application.membersData);
    const family = await createWithDisplayId(
      "NPSI-FAM-",
      (prefix) => this.families.latestDisplayIds(prefix, tx),
      (familyId) =>
        this.families.create(
          {
            id: randomId(),
            familyId,
            familyName: application.familyName,
            headName: application.familyHeadName,
            status: "ACTIVE",
            address: application.address,
            city: application.city,
            district: application.district,
            state: application.state,
            pincode: application.pincode,
            gotra: application.gotra,
            nativePlace: application.nativePlace,
            village: application.village,
            contactNumber: application.mobile,
            email: application.email,
            registrationDate: new Date(),
            memberCount: listed.length,
            applicationId: application.applicationId,
            ownerUserId: application.userId,
          },
          tx,
        ),
    );
    const first = Number(nextDisplayId(MEMBER_PREFIX, await this.familyMembers.latestDisplayIds(MEMBER_PREFIX, tx)).slice(MEMBER_PREFIX.length));
    const members = await this.familyMembers.createMany(
      listed.map((member, index) => ({
        id: randomId(),
        membershipId: displayIdAt(MEMBER_PREFIX, first + index),
        familyId: family.familyId as string,
        name: text(member.name) ?? "",
        relationship: text(member.relationship) ?? "",
        gender: text(member.gender),
        dob: dateOnly(member.dob),
        mobile: text(member.mobile),
        email: text(member.email),
        education: text(member.education),
        occupation: text(member.occupation),
        address: text(member.address),
        photoUrl: text(member.photoUrl),
        status: "ACTIVE",
      })),
      tx,
    );
    return { family, members };
  }
}
