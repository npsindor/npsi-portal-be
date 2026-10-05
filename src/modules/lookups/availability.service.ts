import { Injectable } from "@nestjs/common";
import { normalizeMobile } from "../../common/utils/records.js";
import { LookupsRepository } from "./lookups.repository.js";

const notRejected = (excludeId?: string) => (row: { id?: string; status?: string }) => row.status !== "REJECTED" && row.id !== excludeId;
const sameEmail = (target: string) => (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase() === target;

// Duplicate-contact rules, unchanged from the legacy app. Rejected
// applications don't hold on to their mobile/email.
@Injectable()
export class AvailabilityService {
  constructor(private readonly repo: LookupsRepository) {}

  // Public "is this mobile free?" check used by the registration forms.
  async isMobileUsedAnywhere(mobile: unknown): Promise<boolean> {
    const target = normalizeMobile(mobile);
    if (!target) return false;
    const [apps, families, members, studentApps, students] = await this.repo.mobileCheckSources();
    const candidates = [
      ...apps.filter((a) => a.status !== "REJECTED").map((a) => a.mobile),
      ...families.map((f) => f.contact_number),
      ...members.map((m) => m.mobile),
      ...studentApps.filter((a) => a.status !== "REJECTED").map((a) => a.mobile),
      ...students.map((s) => s.mobile),
    ];
    return candidates.some((value) => normalizeMobile(value) === target);
  }

  // Server-side duplicate check when an application is submitted.
  async isMobileTaken(mobile: unknown, excludeApplicationId?: string): Promise<boolean> {
    const target = normalizeMobile(mobile);
    if (!target) return false;
    const [apps, families, members] = await this.repo.mobileTakenSources();
    const candidates = [
      ...apps.filter(notRejected(excludeApplicationId)).map((a) => a.mobile),
      ...families.map((f) => f.contact_number),
      ...members.map((m) => m.mobile),
    ];
    return candidates.some((value) => normalizeMobile(value) === target);
  }

  async isEmailTaken(email: unknown, excludeApplicationId?: string): Promise<boolean> {
    const target = String(email || "")
      .trim()
      .toLowerCase();
    if (!target) return false;
    const [apps, families, members, studentApps, students, users] = await this.repo.emailTakenSources();
    const candidates = [
      ...apps.filter(notRejected(excludeApplicationId)).map((a) => a.email),
      ...families.map((f) => f.email),
      ...members.map((m) => m.email),
      ...studentApps.filter(notRejected(excludeApplicationId)).map((a) => a.email),
      ...students.map((s) => s.email),
      ...users.map((u) => u.email),
    ];
    return candidates.some(sameEmail(target));
  }
}
