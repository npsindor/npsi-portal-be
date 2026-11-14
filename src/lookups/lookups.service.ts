import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import { normalizeMobile } from "../common/utils/text.js";
import { AvailabilityService } from "./availability.service.js";
import type { ApplicationStatusQueryDto, EmailQueryDto, MobileQueryDto } from "./dto/lookups.dto.js";
import { LookupsRepository } from "./lookups.repository.js";
import type { ApplicationStatusVo, AvailabilityVo, FamilyVerificationVo, StatsVo } from "./vo/lookups.vo.js";

// "Ramesh Patidar" → "R***** P******": enough to match a pass holder, not to collect names.
export const maskName = (name: string | null): string | null =>
  name
    ? name
        .trim()
        .split(/\s+/)
        .map((word) => (word.length <= 1 ? word : `${[...word][0]}${"*".repeat(Math.min([...word].length - 1, 6))}`))
        .join(" ")
    : null;

// Public, unauthenticated lookups (membership-card QR checks, "track my
// application", duplicate checks for registration forms, homepage stats).
@Injectable()
export class LookupsService {
  constructor(
    private readonly repo: LookupsRepository,
    private readonly availability: AvailabilityService,
  ) {}

  async verifyFamily(familyId: string): Promise<FamilyVerificationVo> {
    const family = await this.repo.publicFamily(familyId);
    if (!family) throw new ApiError(404, "No family found for this ID.");
    return { family: { ...family, headName: maskName(family.headName), memberCount: await this.repo.memberCount(familyId) } };
  }

  async applicationStatus(query: ApplicationStatusQueryDto): Promise<ApplicationStatusVo> {
    const applicationId = String(query.applicationId || "").trim();
    const mobile = String(query.mobile || "").trim();
    if (!applicationId || !mobile) throw new ApiError(400, "Application ID and mobile number are required.");
    const digits = normalizeMobile(mobile);
    const application = digits ? await this.repo.application(applicationId, digits) : null;
    if (application)
      return {
        applicationId: application.applicationId,
        familyHeadName: application.familyHeadName,
        familyName: application.familyName,
        status: application.status,
        submittedDate: application.submittedDate,
        reviewedDate: application.reviewedDate,
        resultingFamilyId: application.resultingFamilyId,
        adminRemarks: application.adminRemarks,
      };
    // Student applications use the same status page; shown in the same shape (the student as the "head").
    const student = digits ? await this.repo.studentApplication(applicationId, digits) : null;
    if (!student) throw new ApiError(404, "No application found for this ID and mobile number.");
    return {
      applicationId: student.applicationId,
      familyHeadName: student.studentName,
      familyName: student.studentName,
      status: student.status,
      submittedDate: student.submittedDate,
      reviewedDate: student.reviewedDate,
      resultingFamilyId: student.resultingStudentId,
      adminRemarks: student.adminRemarks,
    };
  }

  async mobileAvailability(query: MobileQueryDto): Promise<AvailabilityVo> {
    return { taken: await this.availability.isMobileUsedAnywhere(query.mobile) };
  }

  async emailAvailability(query: EmailQueryDto): Promise<AvailabilityVo> {
    return { taken: await this.availability.isEmailTaken(String(query.email || "")) };
  }

  stats(): Promise<StatsVo> {
    return this.repo.activeCounts();
  }
}
