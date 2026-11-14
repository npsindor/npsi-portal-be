import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import { type CommunityAccount, communityAccount } from "../common/eligibility/community-account.js";
import { ApiError } from "../common/filters/api-error.js";
import { statusUpdateEmail } from "../common/mail/email-templates.js";
import { MailService } from "../common/mail/mail.service.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { isUniqueViolation } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { AppConfigService } from "../config/app-config.service.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { RentalListing, RentalRequirement } from "../generated/prisma/client.js";
import type { AdminListDto, EnquiryDto, ListingDto, PublicSearchDto, RequirementDto, ReviewDto } from "./room-hunting.dto.js";
import {
  addDays,
  displayName,
  LISTING_DAYS,
  matchScore,
  mobile10,
  normalKey,
  notifiable,
  PROPERTY_TYPES,
  RENTAL_AREAS,
  REQUIREMENT_DAYS,
} from "./room-hunting.rules.js";

const PAGE = 12;
const DASHBOARD = "/portal/room-hunting";
// Statuses an owner may still change; ARCHIVED (deleted) and admin-only states are final for them.
const OWNER_EDITABLE = ["PENDING", "APPROVED", "REJECTED", "RENTED", "INACTIVE", "EXPIRED"];

const reference = (prefix: string) => `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const dateOnly = (value: string | undefined) => (value ? new Date(`${value}T00:00:00Z`) : null);
const live = () => ({ status: "APPROVED", expiresAt: { gt: new Date() } });

@Injectable()
export class RoomHuntingService {
  constructor(
    private readonly db: PrismaService,
    private readonly mail: MailService,
    private readonly recaptcha: RecaptchaService,
    private readonly config: AppConfigService,
  ) {}

  // ---- Public ----------------------------------------------------------------------------------------------

  async options() {
    const managed = await this.db.addressOption.findMany({
      where: { kind: { in: ["PROPERTY_TYPE", "RENTAL_AREA"] }, active: true },
      orderBy: [{ sortOrder: "asc" }, { value: "asc" }],
      take: 500,
    });
    const merge = (kind: string, builtIn: [string, string][]) => {
      const own = managed.filter((row) => row.kind === kind).map((row) => ({ value: row.value, hi: row.labelHi || row.value }));
      const seen = new Set(own.map((row) => normalKey(row.value)));
      return [...own, ...builtIn.filter(([en]) => !seen.has(normalKey(en))).map(([value, hi]) => ({ value, hi }))];
    };
    return { propertyTypes: merge("PROPERTY_TYPE", PROPERTY_TYPES), areas: merge("RENTAL_AREA", RENTAL_AREAS) };
  }

  async publicListings(query: PublicSearchDto) {
    await this.expireOld();
    const where = {
      ...live(),
      ...(query.type ? { typeKey: normalKey(query.type) } : {}),
      ...(query.area ? { areaKey: normalKey(query.area) } : {}),
      ...(query.maxRent !== undefined ? { rentAmount: { lte: query.maxRent } } : {}),
      ...(query.q ? { OR: [{ area: { contains: query.q } }, { propertyType: { contains: query.q } }, { description: { contains: query.q } }] } : {}),
    };
    const page = query.page ?? 1;
    const [total, rows] = await Promise.all([
      this.db.rentalListing.count({ where }),
      this.db.rentalListing.findMany({ where, orderBy: { approvedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    ]);
    return { total, page, pageSize: PAGE, items: rows.map((row) => this.publicListing(row)) };
  }

  async publicRequirements(query: PublicSearchDto) {
    await this.expireOld();
    const where = {
      ...live(),
      ...(query.type ? { typeKey: normalKey(query.type) } : {}),
      ...(query.area ? { areaKey: normalKey(query.area) } : {}),
      ...(query.maxRent !== undefined ? { maxBudget: { lte: query.maxRent } } : {}),
      ...(query.q ? { OR: [{ area: { contains: query.q } }, { propertyType: { contains: query.q } }] } : {}),
    };
    const page = query.page ?? 1;
    const [total, rows] = await Promise.all([
      this.db.rentalRequirement.count({ where }),
      this.db.rentalRequirement.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    ]);
    return { total, page, pageSize: PAGE, items: rows.map((row) => this.publicRequirement(row)) };
  }

  // Anyone may post a requirement. Logged-in family members / students are published (and matched) at once;
  // anonymous visitors pass reCAPTCHA and wait for an administrator, so owners are never notified about spam.
  async createRequirement(dto: RequirementDto, user: UserRow | null) {
    assertNoMarkup(dto);
    const account = await communityAccount(this.db, user);
    if (!account && !(await this.recaptcha.verify(dto.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    const mobile = mobile10(dto.mobile);
    if (!mobile) throw new ApiError(400, "ROOM_MOBILE");
    if (dto.minBudget !== undefined && dto.minBudget > dto.maxBudget) throw new ApiError(400, "ROOM_BUDGET");
    if (dto.moveInDate && dto.moveInDate < new Date().toISOString().slice(0, 10)) throw new ApiError(400, "ROOM_MOVE_IN_DATE");
    const replay = await this.db.rentalRequirement.findUnique({ where: { mobile_clientRequestId: { mobile, clientRequestId: dto.clientRequestId } } });
    if (replay) return this.requirementResult(replay);
    const typeKey = normalKey(dto.propertyType);
    const areaKey = normalKey(dto.area);
    // One open requirement per mobile number, property type and area.
    const open = await this.db.rentalRequirement.findFirst({
      where: { mobile, typeKey, areaKey, status: { in: ["PENDING", "APPROVED"] }, expiresAt: { gt: new Date() } },
      select: { reference: true },
    });
    if (open) throw new ApiError(409, "ROOM_DUPLICATE_REQUIREMENT");
    const now = new Date();
    const row = await this.db.rentalRequirement.create({
      data: {
        id: randomId(),
        reference: reference("RQ"),
        clientRequestId: dto.clientRequestId,
        userId: user?.id ?? null,
        name: dto.name,
        mobile,
        email: dto.email || null,
        propertyType: dto.propertyType,
        typeKey,
        tenantType: dto.tenantType || (account?.kind === "STUDENT" ? "STUDENT" : "ANY"),
        area: dto.area,
        areaKey,
        minBudget: dto.minBudget ?? null,
        maxBudget: dto.maxBudget,
        moveInDate: dateOnly(dto.moveInDate),
        note: dto.note || null,
        showMobile: dto.showMobile,
        showEmail: dto.showEmail && Boolean(dto.email),
        status: account ? "APPROVED" : "PENDING",
        expiresAt: addDays(now, REQUIREMENT_DAYS),
      },
    });
    await this.audit(this.db, user?.id ?? null, "CREATE", "REQUIREMENT", row.id, account ? "Published (registered account)" : "Awaiting approval");
    if (row.status === "APPROVED") await this.matchRequirement(row);
    return this.requirementResult(row);
  }

  // ---- Logged-in user ----------------------------------------------------------------------------------------

  async mine(user: UserRow) {
    const account = await communityAccount(this.db, user);
    const [listings, requirements, sent] = await Promise.all([
      this.db.rentalListing.findMany({
        where: { userId: user.id, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" },
        include: {
          matches: { include: { requirement: true }, orderBy: { score: "desc" }, take: 50 },
          enquiries: { orderBy: { createdAt: "desc" }, take: 50 },
        },
      }),
      this.db.rentalRequirement.findMany({
        where: { userId: user.id, status: { not: "ARCHIVED" } },
        orderBy: { createdAt: "desc" },
        include: { matches: { include: { listing: true }, orderBy: { score: "desc" }, take: 20 } },
      }),
      this.db.rentalEnquiry.findMany({ where: { requesterUserId: user.id }, orderBy: { createdAt: "desc" }, include: { listing: true }, take: 50 }),
    ]);
    return {
      eligible: Boolean(account),
      accountKind: account?.kind ?? null,
      listings: listings.map((row) => ({
        ...this.ownListing(row),
        // Matching requirements: what they need, and their contact only where they agreed to share it.
        matches: row.matches
          .filter((match) => match.requirement.status === "APPROVED")
          .map((match) => ({ id: match.id, score: match.score, createdAt: match.createdAt, requirement: this.publicRequirement(match.requirement) })),
        // Enquirers agreed to share their name and mobile with the owner.
        enquiries: row.enquiries.map((enquiry) => ({
          id: enquiry.id,
          name: enquiry.requesterName,
          mobile: enquiry.requesterMobile,
          message: enquiry.message,
          status: enquiry.status,
          createdAt: enquiry.createdAt,
        })),
      })),
      requirements: requirements.map((row) => ({
        ...this.ownRequirement(row),
        matches: row.matches
          .filter((match) => match.listing.status === "APPROVED")
          .map((match) => ({ id: match.id, score: match.score, listing: this.publicListing(match.listing) })),
      })),
      enquiriesSent: sent.map((enquiry) => ({
        id: enquiry.id,
        message: enquiry.message,
        status: enquiry.status,
        createdAt: enquiry.createdAt,
        listing: this.publicListing(enquiry.listing),
      })),
    };
  }

  async createListing(dto: ListingDto, user: UserRow) {
    assertNoMarkup(dto);
    const account = await this.eligible(user);
    const replay = await this.db.rentalListing.findUnique({ where: { userId_clientRequestId: { userId: user.id, clientRequestId: dto.clientRequestId } } });
    if (replay) return this.ownListing(replay);
    const data = this.listingData(dto);
    const duplicate = await this.db.rentalListing.findFirst({
      where: { userId: user.id, typeKey: data.typeKey, areaKey: data.areaKey, rentAmount: data.rentAmount, status: { in: ["PENDING", "APPROVED"] } },
      select: { reference: true },
    });
    if (duplicate) throw new ApiError(409, "ROOM_DUPLICATE_LISTING");
    try {
      const row = await this.db.rentalListing.create({
        data: {
          id: randomId(),
          reference: reference("RL"),
          clientRequestId: dto.clientRequestId,
          userId: user.id,
          memberId: account.memberId,
          familyId: account.familyId,
          studentId: account.studentId,
          ...data,
          status: "PENDING",
        },
      });
      await this.audit(this.db, user.id, "CREATE", "LISTING", row.id, null);
      return this.ownListing(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, "ROOM_DUPLICATE_LISTING");
      throw error;
    }
  }

  // Any change by the owner sends the listing back for review before it is public again.
  async updateListing(id: string, dto: ListingDto, user: UserRow) {
    assertNoMarkup(dto);
    await this.eligible(user);
    const row = await this.ownedListing(id, user);
    const updated = await this.db.rentalListing.update({
      where: { id: row.id },
      data: { ...this.listingData(dto), status: user.role === "admin" ? row.status : "PENDING", adminRemarks: null },
    });
    await this.db.rentalMatch.deleteMany({ where: { listingId: row.id } });
    if (updated.status === "APPROVED") await this.matchListing(updated);
    await this.audit(this.db, user.id, "UPDATE", "LISTING", row.id, null);
    return this.ownListing(updated);
  }

  async setListingStatus(id: string, status: string, user: UserRow) {
    const row = await this.ownedListing(id, user);
    const next = status === "ACTIVE" ? "PENDING" : status;
    if (status === "ACTIVE" && !["RENTED", "INACTIVE", "EXPIRED"].includes(row.status)) throw new ApiError(409, "ROOM_STATE");
    if (status !== "ACTIVE" && !["PENDING", "APPROVED"].includes(row.status)) throw new ApiError(409, "ROOM_STATE");
    const updated = await this.db.rentalListing.update({ where: { id: row.id }, data: { status: next } });
    await this.audit(this.db, user.id, `OWNER_${status}`, "LISTING", row.id, null);
    return this.ownListing(updated);
  }

  // Owners "delete" by archiving; the record stays for the audit trail and disappears everywhere else.
  async removeListing(id: string, user: UserRow) {
    const row = await this.ownedListing(id, user);
    await this.db.rentalListing.update({ where: { id: row.id }, data: { status: "ARCHIVED" } });
    await this.audit(this.db, user.id, "OWNER_DELETE", "LISTING", row.id, null);
    return { ok: true };
  }

  async closeRequirement(id: string, user: UserRow) {
    const row = await this.db.rentalRequirement.findUnique({ where: { id } });
    if (!row || (row.userId !== user.id && user.role !== "admin")) throw new ApiError(404, "ROOM_NOT_FOUND");
    if (!["PENDING", "APPROVED"].includes(row.status)) throw new ApiError(409, "ROOM_STATE");
    const updated = await this.db.rentalRequirement.update({ where: { id }, data: { status: "CLOSED" } });
    await this.audit(this.db, user.id, "CLOSE", "REQUIREMENT", id, null);
    return this.ownRequirement(updated);
  }

  // A registered member/student asks about a listing; the owner gets their name and mobile (with consent).
  async enquire(listingId: string, dto: EnquiryDto, user: UserRow) {
    assertNoMarkup(dto);
    const account = await this.eligible(user);
    const listing = await this.db.rentalListing.findFirst({ where: { id: listingId, ...live() } });
    if (!listing) throw new ApiError(404, "ROOM_NOT_FOUND");
    if (listing.userId === user.id) throw new ApiError(400, "ROOM_OWN_LISTING");
    const mobile = account.mobiles[0];
    if (!mobile) throw new ApiError(400, "ROOM_MOBILE_REQUIRED");
    if (dto.requirementId) {
      const own = await this.db.rentalRequirement.findFirst({ where: { id: dto.requirementId, userId: user.id }, select: { id: true } });
      if (!own) throw new ApiError(404, "ROOM_NOT_FOUND");
    }
    try {
      const enquiry = await this.db.rentalEnquiry.create({
        data: {
          id: randomId(),
          listingId,
          requirementId: dto.requirementId ?? null,
          requesterUserId: user.id,
          requesterName: user.fullName || "Member",
          requesterMobile: mobile,
          message: dto.message,
        },
      });
      await this.notify(
        listing.userId,
        "New enquiry for your rental listing",
        `${user.fullName || "A member"} is interested in your ${listing.propertyType} in ${listing.area} (${listing.reference}). Log in to see their message and mobile number.`,
      );
      await this.audit(this.db, user.id, "ENQUIRY", "LISTING", listingId, null);
      return { id: enquiry.id, status: enquiry.status };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiError(409, "ROOM_ENQUIRY_EXISTS");
      throw error;
    }
  }

  // ---- Admin ---------------------------------------------------------------------------------------------------

  async adminStats() {
    await this.expireOld();
    const [listings, requirements, matches, enquiries] = await Promise.all([
      this.db.rentalListing.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.rentalRequirement.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.rentalMatch.count(),
      this.db.rentalEnquiry.count(),
    ]);
    const counts = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
    return { listings: counts(listings), requirements: counts(requirements), matches, enquiries };
  }

  async adminListings(query: AdminListDto) {
    await this.expireOld();
    const rows = await this.db.rentalListing.findMany({
      where: {
        ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" } }),
        ...(query.q
          ? {
              OR: [
                { reference: { contains: query.q } },
                { area: { contains: query.q } },
                { contactName: { contains: query.q } },
                { contactMobile: { contains: query.q } },
                { propertyType: { contains: query.q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { _count: { select: { matches: true, enquiries: true } } },
    });
    return rows.map((row) => ({
      ...this.ownListing(row),
      memberId: row.memberId,
      familyId: row.familyId,
      studentId: row.studentId,
      matchCount: row._count.matches,
      enquiryCount: row._count.enquiries,
    }));
  }

  async adminRequirements(query: AdminListDto) {
    await this.expireOld();
    const rows = await this.db.rentalRequirement.findMany({
      where: {
        ...(query.status ? { status: query.status } : { status: { not: "ARCHIVED" } }),
        ...(query.q
          ? {
              OR: [
                { reference: { contains: query.q } },
                { area: { contains: query.q } },
                { name: { contains: query.q } },
                { mobile: { contains: query.q } },
                { propertyType: { contains: query.q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { _count: { select: { matches: true } } },
    });
    return rows.map((row) => ({ ...this.ownRequirement(row), registered: Boolean(row.userId), matchCount: row._count.matches }));
  }

  async adminMatches() {
    const rows = await this.db.rentalMatch.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { listing: true, requirement: true } });
    return rows.map((row) => ({
      id: row.id,
      score: row.score,
      status: row.status,
      emailStatus: row.emailStatus,
      notifiedAt: row.notifiedAt,
      createdAt: row.createdAt,
      listing: {
        id: row.listing.id,
        reference: row.listing.reference,
        propertyType: row.listing.propertyType,
        area: row.listing.area,
        rentAmount: row.listing.rentAmount,
        status: row.listing.status,
      },
      requirement: {
        id: row.requirement.id,
        reference: row.requirement.reference,
        name: row.requirement.name,
        propertyType: row.requirement.propertyType,
        area: row.requirement.area,
        maxBudget: row.requirement.maxBudget,
        status: row.requirement.status,
      },
    }));
  }

  async adminAudit(entityId?: string) {
    return this.db.rentalAuditLog.findMany({ where: entityId ? { entityId } : {}, orderBy: { createdAt: "desc" }, take: 300 });
  }

  async reviewListing(id: string, dto: ReviewDto, admin: UserRow) {
    const row = await this.db.rentalListing.findUnique({ where: { id } });
    if (!row) throw new ApiError(404, "ROOM_NOT_FOUND");
    if (dto.decision === "REJECT" && !dto.remarks) throw new ApiError(400, "ROOM_REMARKS_REQUIRED");
    const now = new Date();
    const status = { APPROVE: "APPROVED", REJECT: "REJECTED", DEACTIVATE: "INACTIVE", EXPIRE: "EXPIRED", ARCHIVE: "ARCHIVED", RESTORE: "PENDING" }[
      dto.decision
    ] as string;
    const updated = await this.db.rentalListing.update({
      where: { id },
      data: { status, adminRemarks: dto.remarks ?? null, ...(status === "APPROVED" ? { approvedAt: now, expiresAt: addDays(now, LISTING_DAYS) } : {}) },
    });
    await this.audit(this.db, admin.id, `ADMIN_${dto.decision}`, "LISTING", id, dto.remarks ?? null);
    if (status === "APPROVED") await this.matchListing(updated);
    if (["APPROVED", "REJECTED"].includes(status))
      await this.notify(
        row.userId,
        status === "APPROVED" ? "Your rental listing is published" : "Your rental listing was not approved",
        status === "APPROVED"
          ? `${row.propertyType} in ${row.area} (${row.reference}) is now visible on Room Hunting until ${day(updated.expiresAt)}.`
          : `${row.propertyType} in ${row.area} (${row.reference}): ${dto.remarks}`,
      );
    return this.ownListing(updated);
  }

  async reviewRequirement(id: string, dto: ReviewDto, admin: UserRow) {
    const row = await this.db.rentalRequirement.findUnique({ where: { id } });
    if (!row) throw new ApiError(404, "ROOM_NOT_FOUND");
    if (dto.decision === "REJECT" && !dto.remarks) throw new ApiError(400, "ROOM_REMARKS_REQUIRED");
    const status = { APPROVE: "APPROVED", REJECT: "REJECTED", DEACTIVATE: "CLOSED", EXPIRE: "EXPIRED", ARCHIVE: "ARCHIVED", RESTORE: "PENDING" }[
      dto.decision
    ] as string;
    const updated = await this.db.rentalRequirement.update({
      where: { id },
      data: {
        status,
        adminRemarks: dto.remarks ?? null,
        ...(status === "APPROVED" && row.expiresAt < new Date() ? { expiresAt: addDays(new Date(), REQUIREMENT_DAYS) } : {}),
      },
    });
    await this.audit(this.db, admin.id, `ADMIN_${dto.decision}`, "REQUIREMENT", id, dto.remarks ?? null);
    if (status === "APPROVED") await this.matchRequirement(updated);
    return this.ownRequirement(updated);
  }

  // ---- Matching ------------------------------------------------------------------------------------------------

  // Matches a published requirement with live listings and tells owners about strong matches (in-app, and by email
  // when SMTP is configured). Weaker matches are only shown to the person looking.
  private async matchRequirement(requirement: RentalRequirement) {
    const candidates = await this.db.rentalListing.findMany({
      where: { ...live(), rentAmount: { lte: Math.floor(requirement.maxBudget * 1.1) }, userId: requirement.userId ? { not: requirement.userId } : undefined },
      take: 500,
    });
    const scored = candidates
      .map((listing) => ({ listing, score: matchScore(requirement, listing) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
    for (const { listing, score } of scored) {
      const match = await this.db.rentalMatch.upsert({
        where: { requirementId_listingId: { requirementId: requirement.id, listingId: listing.id } },
        create: { id: randomId(), requirementId: requirement.id, listingId: listing.id, score },
        update: { score },
      });
      if (match.notifiedAt || !notifiable(requirement, listing)) continue;
      const budget = `₹${requirement.minBudget ? `${requirement.minBudget.toLocaleString("en-IN")} – ` : "up to "}${requirement.maxBudget.toLocaleString("en-IN")}`;
      const emailStatus = await this.notify(
        listing.userId,
        "New Room Requirement Matching Your Listing",
        `Someone is looking for a ${requirement.propertyType} in ${requirement.area}. Budget: ${budget} per month. Log in to your NPS Indore account to view the request and contact the applicant if appropriate.`,
      );
      await this.db.rentalMatch.update({ where: { id: match.id }, data: { status: "NOTIFIED", notifiedAt: new Date(), emailStatus } });
    }
    return scored.length;
  }

  // A newly published listing is matched with open requirements; the owner gets one summary notice.
  private async matchListing(listing: RentalListing) {
    const requirements = await this.db.rentalRequirement.findMany({
      where: {
        ...live(),
        maxBudget: { gte: Math.ceil(listing.rentAmount / 1.1) },
        ...(listing.userId ? { OR: [{ userId: null }, { userId: { not: listing.userId } }] } : {}),
      },
      take: 500,
    });
    let strong = 0;
    for (const requirement of requirements) {
      const score = matchScore(requirement, listing);
      if (!score) continue;
      const isStrong = notifiable(requirement, listing);
      strong += isStrong ? 1 : 0;
      await this.db.rentalMatch.upsert({
        where: { requirementId_listingId: { requirementId: requirement.id, listingId: listing.id } },
        create: {
          id: randomId(),
          requirementId: requirement.id,
          listingId: listing.id,
          score,
          ...(isStrong ? { status: "NOTIFIED", notifiedAt: new Date() } : {}),
        },
        update: { score },
      });
    }
    if (strong)
      await this.notify(
        listing.userId,
        "People are looking for a place like yours",
        `${strong} room requirement(s) match your ${listing.propertyType} in ${listing.area}. Log in to Room Hunting to see them.`,
      );
  }

  // ---- Helpers ---------------------------------------------------------------------------------------------------

  private async eligible(user: UserRow): Promise<CommunityAccount> {
    const account = await communityAccount(this.db, user);
    if (!account) throw new ApiError(403, "ROOM_MEMBERSHIP_REQUIRED");
    return account;
  }

  private async ownedListing(id: string, user: UserRow) {
    const row = await this.db.rentalListing.findUnique({ where: { id } });
    if (!row || (row.userId !== user.id && user.role !== "admin") || !OWNER_EDITABLE.includes(row.status)) throw new ApiError(404, "ROOM_NOT_FOUND");
    return row;
  }

  private listingData(dto: ListingDto) {
    const contactMobile = mobile10(dto.contactMobile);
    if (!contactMobile) throw new ApiError(400, "ROOM_MOBILE");
    if (dto.showEmail && !dto.contactEmail) throw new ApiError(400, "ROOM_EMAIL_REQUIRED");
    return {
      propertyType: dto.propertyType,
      typeKey: normalKey(dto.propertyType),
      availableFor: dto.availableFor || "ANY",
      rentAmount: dto.rentAmount,
      area: dto.area,
      areaKey: normalKey(dto.area),
      address: dto.address || null,
      showAddress: Boolean(dto.showAddress && dto.address),
      availableFrom: dateOnly(dto.availableFrom),
      description: dto.description || null,
      photoUrl: dto.photoUrl || null,
      contactName: dto.contactName,
      contactMobile,
      contactEmail: dto.contactEmail || null,
      showMobile: dto.showMobile,
      showEmail: dto.showEmail,
      ownerConfirmed: true,
    };
  }

  // Public shape: no owner identity beyond the name they post under, contacts only as the owner chose.
  private publicListing(row: RentalListing) {
    return {
      id: row.id,
      reference: row.reference,
      propertyType: row.propertyType,
      availableFor: row.availableFor,
      rentAmount: row.rentAmount,
      area: row.area,
      address: row.showAddress ? row.address : null,
      availableFrom: day(row.availableFrom),
      description: row.description,
      photoUrl: row.photoUrl,
      contactName: displayName(row.contactName),
      mobile: row.showMobile ? row.contactMobile : null,
      email: row.showEmail ? row.contactEmail : null,
      contactHidden: !row.showMobile && !row.showEmail,
      status: row.status === "APPROVED" ? "AVAILABLE" : row.status,
      postedAt: row.approvedAt ?? row.createdAt,
    };
  }
  private ownListing(row: RentalListing) {
    return {
      ...this.publicListing(row),
      contactName: row.contactName,
      address: row.address,
      showAddress: row.showAddress,
      contactMobile: row.contactMobile,
      contactEmail: row.contactEmail,
      showMobile: row.showMobile,
      showEmail: row.showEmail,
      status: row.status,
      adminRemarks: row.adminRemarks,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
  private publicRequirement(row: RentalRequirement) {
    return {
      id: row.id,
      reference: row.reference,
      name: displayName(row.name),
      propertyType: row.propertyType,
      tenantType: row.tenantType,
      area: row.area,
      minBudget: row.minBudget,
      maxBudget: row.maxBudget,
      moveInDate: day(row.moveInDate),
      note: row.note,
      mobile: row.showMobile ? row.mobile : null,
      email: row.showEmail ? row.email : null,
      contactHidden: !row.showMobile && !row.showEmail,
      postedAt: row.createdAt,
      expiresAt: row.expiresAt,
    };
  }
  private ownRequirement(row: RentalRequirement) {
    return {
      ...this.publicRequirement(row),
      name: row.name,
      mobile: row.mobile,
      email: row.email,
      showMobile: row.showMobile,
      showEmail: row.showEmail,
      status: row.status,
      adminRemarks: row.adminRemarks,
    };
  }
  private async requirementResult(row: RentalRequirement) {
    const matches =
      row.status === "APPROVED"
        ? await this.db.rentalMatch.findMany({
            where: { requirementId: row.id, listing: live() },
            include: { listing: true },
            orderBy: { score: "desc" },
            take: 10,
          })
        : [];
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      expiresAt: row.expiresAt,
      matches: matches.map((match) => ({ score: match.score, listing: this.publicListing(match.listing) })),
    };
  }

  // In-app notice always; email only when SMTP is configured and the user has an email. Returns the email outcome
  // (never claims "SENT" when sending failed).
  private async notify(userId: string, title: string, message: string): Promise<string> {
    await this.db.notification.create({
      data: { id: randomId(), title, message, type: "room_hunting", recipientUserId: userId, date: new Date(), deepLink: DASHBOARD },
    });
    if (!this.mail.isConfigured()) return "UNAVAILABLE";
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { email: true, fullName: true } });
    if (!user?.email) return "NO_EMAIL";
    try {
      await this.mail.send({
        to: user.email,
        ...statusUpdateEmail({ name: user.fullName || "Member", title, message, loginUrl: `${this.config.frontendUrl}${DASHBOARD}` }),
      });
      return "SENT";
    } catch (error) {
      console.warn(`[room-hunting] email to ${userId} failed: ${error instanceof Error ? error.message : error}`);
      return "FAILED";
    }
  }

  private async audit(db: Db, actorUserId: string | null, action: string, entity: string, entityId: string, remarks: string | null) {
    await db.rentalAuditLog.create({ data: { id: randomId(), actorUserId, action, entity, entityId, remarks } });
  }

  // Old records stop being public by themselves.
  private async expireOld() {
    const now = new Date();
    await this.db.rentalListing.updateMany({ where: { status: "APPROVED", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
    await this.db.rentalRequirement.updateMany({ where: { status: { in: ["APPROVED", "PENDING"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  }
}
