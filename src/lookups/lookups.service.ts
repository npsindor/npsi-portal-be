import { Injectable } from "@nestjs/common";
import { type ApplicationVo, toApplicationVo } from "../applications/vo/applications.vo.js";
import { ApiError } from "../common/filters/api-error.js";
import { AvailabilityService } from "./availability.service.js";
import type { ApplicationStatusQueryDto, EmailQueryDto, MobileQueryDto } from "./dto/lookups.dto.js";
import { LookupsRepository } from "./lookups.repository.js";
import type { AvailabilityVo, FamilyVerificationVo, StatsVo } from "./vo/lookups.vo.js";

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
    const members = await this.repo.publicMembers(familyId);
    return { family, members };
  }

  async applicationStatus(query: ApplicationStatusQueryDto): Promise<ApplicationVo> {
    const applicationId = String(query.applicationId || "").trim();
    const mobile = String(query.mobile || "").trim();
    if (!applicationId || !mobile) throw new ApiError(400, "Application ID and mobile number are required.");
    const application = await this.repo.application(applicationId, mobile);
    if (!application) throw new ApiError(404, "No application found for this ID and mobile number.");
    return toApplicationVo(application);
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
