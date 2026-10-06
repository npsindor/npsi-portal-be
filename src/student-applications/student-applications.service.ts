import { Injectable } from "@nestjs/common";
import { DEFAULT_LIMIT, toOrderBy } from "../common/dto/list-query.dto.js";
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
import { workflowNotification } from "../notifications/notification-texts.js";
import { NotificationsRepository } from "../notifications/notifications.repository.js";
import type { CreateStudentApplicationDto, StudentApplicationListQueryDto, UpdateStudentApplicationDto } from "./dto/student-applications.dto.js";
import { StudentApplicationsRepository } from "./student-applications.repository.js";
import { type StudentApplicationVo, toStudentApplicationVo } from "./vo/student-applications.vo.js";

// Student registration applications: public form with reCAPTCHA, always
// starting PENDING_VERIFICATION for admins to review. A public submission also
// sends the "submitted" notification, in the same transaction.
@Injectable()
export class StudentApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: StudentApplicationsRepository,
    private readonly notifications: NotificationsRepository,
    private readonly availability: AvailabilityService,
    private readonly recaptcha: RecaptchaService,
  ) {}

  async list(query: StudentApplicationListQueryDto): Promise<StudentApplicationVo[]> {
    const rows = await this.repo.list({}, toOrderBy(query.order ?? "-createdAt"), query.limit ?? DEFAULT_LIMIT);
    return rows.map(toStudentApplicationVo);
  }

  async create(dto: CreateStudentApplicationDto, user: UserRow | null): Promise<StudentApplicationVo> {
    const { recaptchaToken, lang, ...input } = dto;
    const isPublic = user?.role !== "admin";
    if (isPublic) {
      assertNoMarkup(input);
      input.status = "PENDING_VERIFICATION";
      delete input.adminRemarks;
      delete input.reviewedDate;
      delete input.resultingStudentId;
    }
    if (!(await this.recaptcha.verify(recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    await this.validate(input);
    const row = await this.prisma.$transaction(async (tx) => {
      const application = await createWithDisplayId(
        `NPSI-STU-APP-${new Date().getFullYear()}-`,
        (prefix) => this.repo.latestDisplayIds(prefix, tx),
        (applicationId) => this.repo.create({ id: randomId(), applicationId, ...toCreateData(input) }, tx),
      );
      if (isPublic) {
        const { applicationId } = application;
        await this.notifications.create(workflowNotification("studentApplicationSubmitted", applicationId, { applicationId }, lang), tx);
      }
      return application;
    });
    return toStudentApplicationVo(row);
  }

  async update(id: string, dto: UpdateStudentApplicationDto): Promise<StudentApplicationVo> {
    const row = await this.repo.update(id, toUpdateData(dto));
    if (!row) throw new ApiError(404, "Record not found");
    return toStudentApplicationVo(row);
  }

  remove(id: string): Promise<void> {
    return this.repo.delete(id);
  }

  private async validate(input: Omit<CreateStudentApplicationDto, "recaptchaToken" | "lang">): Promise<void> {
    if (blank(input.studentName)) throw new ApiError(400, "Student name is required.");
    if (!input.mobile || normalizeMobile(input.mobile).length !== 10) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (input.guardianMobile && normalizeMobile(input.guardianMobile).length !== 10)
      throw new ApiError(400, "Guardian mobile number must be a valid 10-digit number.");
    if (!input.email || !EMAIL_PATTERN.test(input.email)) throw new ApiError(400, "A valid email address is required.");
    if (blank(input.gender)) throw new ApiError(400, "Gender is required.");
    if (blank(input.fatherName)) throw new ApiError(400, "Father's name is required.");
    if (blank(input.academicYear)) throw new ApiError(400, "Academic year is required.");
    if (await this.availability.isMobileTaken(input.mobile)) throw new ApiError(409, "This mobile number is already registered on the portal.");
    if (await this.availability.isEmailTaken(input.email)) throw new ApiError(409, "This email is already registered on the portal.");
  }
}

// Request fields → Prisma data. Fields that weren't sent stay undefined, which Prisma skips.
// Required columns are checked by validate() first.
const toCreateData = (
  input: Omit<CreateStudentApplicationDto, "recaptchaToken" | "lang">,
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
  updatedAt: new Date(),
});
