import { Injectable } from "@nestjs/common";
import { APPROVE_THROUGH_REVIEW } from "../applications/applications.service.js";
import { type AdminScope, SUPER_ADMIN_SCOPE } from "../common/admin-access/admin-scope.js";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
import { bindsToFamily, loginAccountForEmail, STUDENT_EMAIL_IS_FAMILY_LOGIN } from "../common/eligibility/login-account.js";
import { ApiError } from "../common/filters/api-error.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { createWithDisplayId } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { blank, EMAIL_PATTERN, normalizeMobile } from "../common/utils/text.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AvailabilityService } from "../lookups/availability.service.js";
import { MembershipRepository } from "../membership/membership.repository.js";
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import { FEE_TYPES, FEES } from "../registrations/registration.rules.js";
import { TransactionsRepository } from "../transactions/transactions.repository.js";
import type { CreateStudentApplicationDto, StudentApplicationListQueryDto, UpdateStudentApplicationDto } from "./dto/student-applications.dto.js";
import { StudentApplicationsRepository } from "./student-applications.repository.js";
import { type StudentApplicationVo, toStudentApplicationVo, toStudentPaymentVo } from "./vo/student-applications.vo.js";

// Student registration applications: public form with reCAPTCHA, always
// starting PENDING_VERIFICATION for admins to review. A public submission also
// records the ₹100 registration fee (PENDING, like the family form: approval waits for an admin to verify it) and
// sends the "submitted" notification, in the same transaction.
@Injectable()
export class StudentApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StudentApplicationsRepository,
    private readonly notifications: NotificationsRepository,
    private readonly availability: AvailabilityService,
    private readonly membership: MembershipRepository,
    private readonly recaptcha: RecaptchaService,
    private readonly transactions: TransactionsRepository,
  ) {}

  // Student applications carry no village: a staff member limited to some villages sees none.
  async list(query: StudentApplicationListQueryDto, scope: AdminScope = SUPER_ADMIN_SCOPE): Promise<StudentApplicationVo[]> {
    if (!scope.allVillages) return [];
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT, query.offset);
    // Each application with its registration fee (newest first, so the first match is the current one).
    const fees = await this.transactions.feesFor(rows.map((row) => row.applicationId));
    return rows.map((row) => ({ ...toStudentApplicationVo(row), payment: toStudentPaymentVo(fees.find((fee) => fee.referenceId === row.applicationId)) }));
  }

  async create(dto: CreateStudentApplicationDto, user: UserRow | null): Promise<StudentApplicationVo> {
    const { recaptchaToken, lang, memberId, ...input } = dto;
    const isPublic = user?.role !== "admin";
    let familyLink: { linkedFamilyId: string; linkedMemberId: string; linkedMembershipId: string | null } | null = null;
    if (memberId) {
      if (!user || user.role !== "user") throw new ApiError(403, "Sign in with the family member account to link a student to family records.");
      const userMobile = normalizeMobile(user.phone);
      let familyId = await this.membership.ownFamilyId(user);
      if (!familyId && userMobile) {
        familyId =
          (await this.prisma.familyMember.findFirst({ where: { mobileDigits: userMobile, status: "ACTIVE" }, select: { familyId: true } }))?.familyId ?? null;
      }
      if (!familyId) throw new ApiError(403, "No approved family membership is linked to this account.");
      const member = await this.prisma.familyMember.findFirst({ where: { id: memberId, familyId, status: "ACTIVE" } });
      if (!member) throw new ApiError(403, "This member is not part of your approved family.");
      familyLink = { linkedFamilyId: familyId, linkedMemberId: member.id, linkedMembershipId: member.membershipId };
    }
    if (isPublic) {
      assertNoMarkup(input);
      input.status = "PENDING_VERIFICATION";
      delete input.adminRemarks;
      delete input.reviewedDate;
      delete input.resultingStudentId;
    }
    // Admins entering an application from the admin panel have no reCAPTCHA token.
    if (isPublic && !(await this.recaptcha.verify(recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    await this.validate(input, Boolean(familyLink));
    // The student gets their own Student Login from this email; it must not be a Family Member login (a parent's own
    // email, say). A student linked to a family member may use that member's own email.
    const linkedEmail = familyLink
      ? (await this.prisma.familyMember.findFirst({ where: { id: familyLink.linkedMemberId }, select: { email: true } }))?.email
      : null;
    const sameAsMember = Boolean(linkedEmail && linkedEmail.trim().toLowerCase() === input.email?.trim().toLowerCase());
    if (isPublic && !sameAsMember && bindsToFamily(await loginAccountForEmail(this.prisma, input.email)))
      throw new ApiError(409, STUDENT_EMAIL_IS_FAMILY_LOGIN);
    // A signed-in person registering themselves (same email as the account) is linked to that account, so approval
    // reuses it instead of inviting a second login. A parent registering a child (another email) is not linked.
    const ownAccount = Boolean(
      user && user.role === "user" && user.email && input.email && user.email.trim().toLowerCase() === input.email.trim().toLowerCase(),
    );
    const row = await this.prisma.$transaction(async (tx) => {
      const application = await createWithDisplayId(
        `NPSI-STU-APP-${new Date().getFullYear()}-`,
        (prefix) => this.repo.latestDisplayIds(prefix, tx),
        (applicationId) =>
          this.repo.create({ id: randomId(), applicationId, ...toCreateData(input), ...(familyLink ?? {}), ...(ownAccount ? { userId: user?.id } : {}) }, tx),
      );
      if (isPublic) {
        const { applicationId } = application;
        await createWithDisplayId(
          "TXN-",
          (prefix) => this.transactions.latestDisplayIds(prefix, tx),
          (transactionId) =>
            this.transactions.create(
              {
                id: randomId(),
                transactionId,
                type: FEE_TYPES.STUDENT,
                amount: FEES.STUDENT,
                paymentMethod: "UPI",
                paymentStatus: "PENDING",
                referenceId: applicationId,
                date: new Date(),
                remarks: "Student registration fee",
              },
              tx,
            ),
        );
        await this.notifications.create(workflowNotification("studentApplicationSubmitted", applicationId, { applicationId }, lang), tx);
      }
      return application;
    });
    return toStudentApplicationVo(row);
  }

  async update(id: string, dto: UpdateStudentApplicationDto): Promise<StudentApplicationVo> {
    if (dto.status === "APPROVED") throw new ApiError(409, APPROVE_THROUGH_REVIEW);
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toStudentApplicationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  private async validate(input: Omit<CreateStudentApplicationDto, "recaptchaToken" | "lang" | "memberId">, linkedFamilyMember = false): Promise<void> {
    if (blank(input.studentName)) throw new ApiError(400, "Student name is required.");
    if (!input.mobile || normalizeMobile(input.mobile).length !== 10) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (input.guardianMobile && normalizeMobile(input.guardianMobile).length !== 10)
      throw new ApiError(400, "Guardian mobile number must be a valid 10-digit number.");
    if (!input.email || !EMAIL_PATTERN.test(input.email)) throw new ApiError(400, "A valid email address is required.");
    if (blank(input.gender)) throw new ApiError(400, "Gender is required.");
    if (blank(input.fatherName)) throw new ApiError(400, "Father's name is required.");
    if (blank(input.academicYear)) throw new ApiError(400, "Academic year is required.");
    if (await this.availability.isStudentMobileTaken(input.mobile)) throw new ApiError(409, "This mobile number is already registered on the portal.");
    const emailTaken = linkedFamilyMember ? await this.availability.isStudentEmailTaken(input.email) : await this.availability.isEmailTaken(input.email);
    if (emailTaken) throw new ApiError(409, "This email is already registered on the portal.");
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
// Required columns are checked by validate() first.
const toCreateData = (
  input: Omit<CreateStudentApplicationDto, "recaptchaToken" | "lang" | "memberId">,
): Omit<Prisma.StudentApplicationUncheckedCreateInput, "id" | "applicationId"> => ({
  status: input.status,
  studentName: input.studentName as string,
  mobile: input.mobile as string,
  email: input.email,
  dob: parseDate(input.dob),
  gender: input.gender,
  course: input.course,
  institution: input.institution,
  academicYear: input.academicYear,
  guardianName: input.guardianName,
  guardianMobile: input.guardianMobile,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  photoUrl: input.photoUrl,
  submittedDate: parseDate(input.submittedDate),
  adminRemarks: input.adminRemarks,
  reviewedDate: parseDate(input.reviewedDate),
  resultingStudentId: input.resultingStudentId,
  fatherName: input.fatherName,
  motherName: input.motherName,
  educationLevel: input.educationLevel,
});

const toUpdateData = (input: UpdateStudentApplicationDto): Prisma.StudentApplicationUncheckedUpdateInput => ({
  status: input.status,
  studentName: input.studentName,
  mobile: input.mobile,
  email: input.email,
  dob: parseDate(input.dob),
  gender: input.gender,
  course: input.course,
  institution: input.institution,
  academicYear: input.academicYear,
  guardianName: input.guardianName,
  guardianMobile: input.guardianMobile,
  address: input.address,
  city: input.city,
  district: input.district,
  state: input.state,
  pincode: input.pincode,
  photoUrl: input.photoUrl,
  submittedDate: parseDate(input.submittedDate),
  adminRemarks: input.adminRemarks,
  reviewedDate: parseDate(input.reviewedDate),
  resultingStudentId: input.resultingStudentId,
  fatherName: input.fatherName,
  motherName: input.motherName,
  educationLevel: input.educationLevel,
});
