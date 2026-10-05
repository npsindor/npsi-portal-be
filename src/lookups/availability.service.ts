import { Injectable } from "@nestjs/common";
import { normalizeMobile } from "../common/utils/records.js";
import { LookupsRepository } from "./lookups.repository.js";

// Duplicate-contact rules, unchanged from the legacy app: mobiles match on
// their last 10 digits, emails trimmed and case-insensitively, and rejected
// applications don't hold on to their mobile/email. Matching runs in MySQL.
@Injectable()
export class AvailabilityService {
  constructor(private readonly repo: LookupsRepository) {}

  // Public "is this mobile free?" check used by the registration forms.
  async isMobileUsedAnywhere(mobile: unknown): Promise<boolean> {
    const target = normalizeMobile(mobile);
    return target ? this.repo.mobileUsedAnywhere(target) : false;
  }

  // Server-side duplicate check when an application is submitted.
  async isMobileTaken(mobile: unknown, excludeApplicationId?: string): Promise<boolean> {
    const target = normalizeMobile(mobile);
    return target ? this.repo.mobileTaken(target, excludeApplicationId) : false;
  }

  async isEmailTaken(email: unknown, excludeApplicationId?: string): Promise<boolean> {
    const target = String(email || "")
      .trim()
      .toLowerCase();
    return target ? this.repo.emailTaken(target, excludeApplicationId) : false;
  }
}
