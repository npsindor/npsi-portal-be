import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import { communityAccount } from "../common/eligibility/community-account.js";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { isUniqueViolation } from "../common/utils/display-ids.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { escapeLike } from "../common/utils/text.js";
import { PrismaService } from "../database/prisma.service.js";
import type { BloodDonor, BloodRequest, Prisma } from "../generated/prisma/client.js";
import { asLang, type Lang, userNotification } from "../notifications/notification-texts.js";
import type { AdminStatusDto, BloodRequestDto, DonorDto, NotifyDonorsDto, RequestListDto } from "./blood-help.dto.js";
import {
  compatibleDonors,
  DEFAULT_DONATION_GAP_DAYS,
  donorEligible,
  type HistoryEntry,
  historyOf,
  mobile10,
  needsConfirmation,
  nextEligibleDate,
  type RequestStatus,
  whatsappLink,
} from "./blood-help.rules.js";

export const MEMBERS_ONLY = "BLOOD_MEMBERS_ONLY";
export const NOT_FOUND = "Blood request not found.";
const RECENT = 5;
const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const reference = () => `BR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

// The WhatsApp messages, in the language of the person sending them.
const MESSAGES: Record<Lang, { toContact: string; toDonor: string }> = {
  en: {
    toContact:
      "Namaste {name}, I saw the blood request on NPS Indore Blood Help Network for {patient} ({group}, {units} unit(s)) at {hospital}, {city}. I would like to help.",
    toDonor:
      "Namaste {name}, {patient} needs {units} unit(s) of {group} blood at {hospital}, {city}. If you can donate, please contact {contact} on {phone}. — NPS Indore Blood Help Network",
  },
  hi: {
    toContact:
      "नमस्ते {name}, मैंने NPS इंदौर ब्लड हेल्प नेटवर्क पर {patient} ({group}, {units} यूनिट) के लिए {hospital}, {city} का रक्त अनुरोध देखा। मैं मदद करना चाहता/चाहती हूँ।",
    toDonor:
      "नमस्ते {name}, {patient} को {hospital}, {city} में {group} रक्त की {units} यूनिट चाहिए। यदि आप रक्तदान कर सकते हैं तो कृपया {contact} से {phone} पर संपर्क करें। — NPS इंदौर ब्लड हेल्प नेटवर्क",
  },
};
const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_m, key: string) => String(vars[key] ?? ""));

// Blood Help Network (Community Services → Blood Donor). Registered community members (an active family member or
// student) register as donors, request blood, see community requests and contact the request's point of contact.
// Donor mobile numbers are never listed: only the requester sees a WhatsApp button for the donors suggested for their
// own request. A request is COMPLETED only when its requester confirms the blood was received or an administrator
// verifies it; both are recorded in the request's history.
@Injectable()
export class BloodHelpService {
  constructor(private readonly db: PrismaService) {}

  private gapDays(): number {
    const value = Number(process.env.BLOOD_DONATION_GAP_DAYS);
    return Number.isInteger(value) && value >= DEFAULT_DONATION_GAP_DAYS ? value : DEFAULT_DONATION_GAP_DAYS;
  }

  private async member(user: UserRow | null) {
    const account = await communityAccount(this.db, user);
    if (!account || !user) throw new ApiError(403, MEMBERS_ONLY);
    return { account, user };
  }

  // ---- Public ----------------------------------------------------------------------------------------------

  // Home page figures. Fulfilled counts only requests confirmed by the requester or verified by an administrator.
  async summary() {
    const [donors, requests, fulfilled] = await Promise.all([
      this.db.bloodDonor.count({ where: { available: true } }),
      this.db.bloodRequest.count(),
      this.db.bloodRequest.count({ where: { status: "COMPLETED", completionSource: { in: ["REQUESTER", "ADMIN"] } } }),
    ]);
    return { donors, requests, fulfilled };
  }

  // ---- Donor -----------------------------------------------------------------------------------------------

  // The form's read-only details come from the member's own records; the donor row holds only the donor fields.
  async profile(viewer: UserRow | null) {
    const { account, user } = await this.member(viewer);
    const family = account.familyId
      ? await this.db.family.findUnique({ where: { familyId: account.familyId }, select: { city: true, district: true, address: true } })
      : null;
    const student = account.studentId
      ? await this.db.student.findFirst({ where: { studentId: account.studentId }, select: { city: true, address: true } })
      : null;
    const place = family?.city || family?.district || student?.city || null;
    const donor = await this.db.bloodDonor.findUnique({ where: { userId: user.id } });
    return {
      name: user.fullName || "",
      mobile: mobile10(user.phone) ?? account.mobiles[0] ?? "",
      city: place || "",
      donor: donor ? this.donorView(donor) : null,
      gapDays: this.gapDays(),
    };
  }

  async saveDonor(viewer: UserRow | null, dto: DonorDto) {
    const { user } = await this.member(viewer);
    if (!mobile10(user.phone)) throw new ApiError(400, "BLOOD_DONOR_MOBILE");
    const last = dto.lastDonationDate ? new Date(`${dto.lastDonationDate}T00:00:00Z`) : null;
    if (last && (Number.isNaN(last.getTime()) || last.getTime() > Date.now())) throw new ApiError(400, "Last donation date can't be in the future.");
    const data = { bloodGroup: dto.bloodGroup, lastDonationDate: last, available: dto.available ?? true };
    const donor = await this.db.bloodDonor.upsert({ where: { userId: user.id }, create: { id: randomId(), userId: user.id, ...data }, update: data });
    return this.donorView(donor);
  }

  private donorView(donor: BloodDonor) {
    return {
      id: donor.id,
      bloodGroup: donor.bloodGroup,
      lastDonationDate: day(donor.lastDonationDate),
      nextEligibleDate: day(nextEligibleDate(donor.lastDonationDate, this.gapDays())),
      available: donor.available,
    };
  }

  // ---- Requests --------------------------------------------------------------------------------------------

  async createRequest(viewer: UserRow | null, dto: BloodRequestDto) {
    const { user } = await this.member(viewer);
    assertNoMarkup(dto);
    const contactPhone = mobile10(dto.contactPhone);
    if (!contactPhone) throw new ApiError(400, "Enter a valid 10-digit mobile number for the contact person.");
    const created: HistoryEntry = { at: new Date().toISOString(), status: "IN_PROGRESS", source: "CREATED", byId: user.id };
    for (let attempt = 1; ; attempt += 1) {
      try {
        const row = await this.db.bloodRequest.create({
          data: {
            id: randomId(),
            reference: reference(),
            userId: user.id,
            patientName: dto.patientName.trim(),
            bloodGroup: dto.bloodGroup,
            units: dto.units,
            hospital: dto.hospital.trim(),
            city: dto.city.trim(),
            contactName: dto.contactName.trim(),
            contactPhone,
            history: [created] as unknown as Prisma.InputJsonValue,
          },
        });
        return { request: this.requestView(row, user.id, asLang(dto.lang)), suggestions: await this.matchingDonors(row, user.id, asLang(dto.lang)) };
      } catch (error) {
        if (attempt >= 3 || !isUniqueViolation(error)) throw error;
      }
    }
  }

  // Eligible donors for a request: compatible blood group, available, rested since their last donation, not the requester.
  private async matchingDonors(request: BloodRequest, requesterId: string, lang: Lang) {
    const now = new Date();
    const donors = await this.db.bloodDonor.findMany({
      where: { bloodGroup: { in: compatibleDonors(request.bloodGroup) }, available: true, userId: { not: requesterId } },
      orderBy: [{ lastDonationDate: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    const eligible = donors.filter((donor) => donorEligible(donor, now, this.gapDays()));
    const users = eligible.length
      ? await this.db.user.findMany({
          where: { id: { in: eligible.map((d) => d.userId) }, status: "active" },
          select: { id: true, fullName: true, phone: true },
        })
      : [];
    return eligible.flatMap((donor) => {
      const person = users.find((u) => u.id === donor.userId);
      const name = person?.fullName || "";
      const message = fill(MESSAGES[lang].toDonor, {
        name,
        patient: request.patientName,
        units: request.units,
        group: request.bloodGroup,
        hospital: request.hospital,
        city: request.city,
        contact: request.contactName,
        phone: request.contactPhone,
      });
      const whatsapp = person ? whatsappLink(person.phone, message) : null;
      return person && whatsapp
        ? [
            {
              donorId: donor.id,
              name,
              bloodGroup: donor.bloodGroup,
              lastDonationDate: day(donor.lastDonationDate),
              whatsapp,
              exactMatch: donor.bloodGroup === request.bloodGroup,
            },
          ]
        : [];
    });
  }

  private async ownRequest(id: string, user: UserRow): Promise<BloodRequest> {
    const row = await this.db.bloodRequest.findUnique({ where: { id } });
    if (!row || (row.userId !== user.id && user.role !== "admin")) throw new ApiError(404, NOT_FOUND);
    return row;
  }

  async suggestions(viewer: UserRow | null, id: string, lang?: Lang) {
    const { user } = await this.member(viewer);
    const row = await this.ownRequest(id, user);
    if (row.status !== "IN_PROGRESS") return [];
    return this.matchingDonors(row, row.userId, asLang(lang));
  }

  // "Send to selected donors": an in-app notification to each chosen donor (only donors suggested for this request).
  async notifyDonors(viewer: UserRow | null, id: string, dto: NotifyDonorsDto) {
    const { user } = await this.member(viewer);
    const row = await this.ownRequest(id, user);
    if (row.status !== "IN_PROGRESS") throw new ApiError(409, "This blood request is already completed.");
    const allowed = new Map((await this.matchingDonors(row, row.userId, "en")).map((s) => [s.donorId, s]));
    const chosen = [...new Set(dto.donorIds)].filter((donorId) => allowed.has(donorId));
    if (!chosen.length) throw new ApiError(400, "Select at least one suggested donor.");
    const donors = await this.db.bloodDonor.findMany({ where: { id: { in: chosen } }, select: { userId: true } });
    const vars = {
      patientName: row.patientName,
      units: String(row.units),
      bloodGroup: row.bloodGroup,
      hospital: row.hospital,
      city: row.city,
      contactName: row.contactName,
      contactPhone: row.contactPhone,
    };
    await this.db.notification.createMany({ data: donors.map((donor) => userNotification("bloodDonorAlert", donor.userId, vars, asLang(dto.lang))) });
    return { sent: donors.length };
  }

  // My requests or the community's (everyone else's), filtered, sorted and paged, with both tab counts.
  async list(viewer: UserRow | null, query: RequestListDto) {
    const { user } = await this.member(viewer);
    const scope = query.scope ?? "community";
    const owner: Prisma.BloodRequestWhereInput = scope === "mine" ? { userId: user.id } : { userId: { not: user.id } };
    const q = query.q ? escapeLike(query.q) : null;
    const where: Prisma.BloodRequestWhereInput = {
      ...owner,
      ...(query.bloodGroup ? { bloodGroup: query.bloodGroup } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [{ patientName: { contains: q } }, { hospital: { contains: q } }] } : {}),
    };
    const sort = query.sort ?? "-createdAt";
    const field = sort.replace(/^-/, "") as "createdAt" | "patientName" | "bloodGroup" | "units" | "status";
    const pageSize = query.pageSize ?? 10;
    const page = query.page ?? 1;
    const [rows, total, mine, community, cities] = await Promise.all([
      this.db.bloodRequest.findMany({
        where,
        orderBy: [{ [field]: sort.startsWith("-") ? "desc" : "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.bloodRequest.count({ where }),
      this.db.bloodRequest.count({ where: { userId: user.id } }),
      this.db.bloodRequest.count({ where: { userId: { not: user.id } } }),
      this.db.bloodRequest.findMany({ where: owner, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" }, take: 200 }),
    ]);
    const lang = asLang(query.lang);
    return {
      rows: rows.map((row) => this.requestView(row, user.id, lang)),
      total,
      page,
      pageSize,
      counts: { mine, community },
      cities: cities.map((row) => row.city),
    };
  }

  // The latest requests still looking for blood (home page).
  async recent(viewer: UserRow | null, lang?: Lang) {
    const { user } = await this.member(viewer);
    const rows = await this.db.bloodRequest.findMany({ where: { status: "IN_PROGRESS" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: RECENT });
    return rows.map((row) => this.requestView(row, user.id, asLang(lang)));
  }

  // The point of contact is reachable (WhatsApp) only while the request is in progress; the number itself is shown
  // only to the requester.
  private requestView(row: BloodRequest, viewerId: string, lang: Lang) {
    const mine = row.userId === viewerId;
    const message = fill(MESSAGES[lang].toContact, {
      name: row.contactName,
      patient: row.patientName,
      group: row.bloodGroup,
      units: row.units,
      hospital: row.hospital,
      city: row.city,
    });
    return {
      id: row.id,
      reference: row.reference,
      patientName: row.patientName,
      bloodGroup: row.bloodGroup,
      units: row.units,
      hospital: row.hospital,
      city: row.city,
      status: row.status,
      requestedOn: row.createdAt,
      completedAt: row.completedAt,
      completionSource: row.completionSource,
      mine,
      contactName: row.contactName,
      contactPhone: mine ? row.contactPhone : null,
      whatsapp: row.status === "IN_PROGRESS" && !mine ? whatsappLink(row.contactPhone, message) : null,
    };
  }

  // ---- Follow-up -------------------------------------------------------------------------------------------

  // The requester's requests to ask "Did you receive the required blood?" about.
  async pendingConfirmations(viewer: UserRow | null) {
    const { user } = await this.member(viewer);
    const rows = await this.db.bloodRequest.findMany({ where: { userId: user.id, status: "IN_PROGRESS" }, orderBy: { createdAt: "asc" }, take: 20 });
    const now = new Date();
    return rows
      .filter((row) => needsConfirmation(row, now))
      .map((row) => ({
        id: row.id,
        reference: row.reference,
        patientName: row.patientName,
        bloodGroup: row.bloodGroup,
        units: row.units,
        hospital: row.hospital,
        requestedOn: row.createdAt,
      }));
  }

  async confirm(viewer: UserRow | null, id: string, received: boolean) {
    const { user } = await this.member(viewer);
    const row = await this.db.bloodRequest.findUnique({ where: { id } });
    if (!row || row.userId !== user.id) throw new ApiError(404, NOT_FOUND);
    if (row.status === "COMPLETED") return this.requestView(row, user.id, "en");
    const now = new Date();
    const updated = received
      ? await this.db.bloodRequest.update({
          where: { id },
          data: {
            status: "COMPLETED",
            completedAt: now,
            completedById: user.id,
            completionSource: "REQUESTER",
            lastPromptedAt: now,
            history: this.withHistory(row, { at: now.toISOString(), status: "COMPLETED", source: "REQUESTER", byId: user.id, note: "Blood received" }),
          },
        })
      : await this.db.bloodRequest.update({
          where: { id },
          data: {
            lastPromptedAt: now,
            history: this.withHistory(row, {
              at: now.toISOString(),
              status: "IN_PROGRESS",
              source: "REQUESTER",
              byId: user.id,
              note: "Blood not received yet",
            }),
          },
        });
    return this.requestView(updated, user.id, "en");
  }

  private withHistory(row: BloodRequest, entry: HistoryEntry): Prisma.InputJsonValue {
    return [...historyOf(row.history), entry] as unknown as Prisma.InputJsonValue;
  }

  // ---- Admin -----------------------------------------------------------------------------------------------

  async adminList(query: RequestListDto) {
    const q = query.q ? escapeLike(query.q) : null;
    const where: Prisma.BloodRequestWhereInput = {
      ...(query.bloodGroup ? { bloodGroup: query.bloodGroup } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q ? { OR: [{ patientName: { contains: q } }, { hospital: { contains: q } }, { reference: { contains: q } }] } : {}),
    };
    const rows = await this.db.bloodRequest.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 500 });
    const people = await this.db.user.findMany({
      where: { id: { in: [...new Set(rows.flatMap((row) => [row.userId, row.completedById ?? ""]).filter(Boolean))] } },
      select: { id: true, fullName: true, email: true, phone: true },
    });
    const who = (userId: string | null) => people.find((person) => person.id === userId) ?? null;
    return rows.map((row) => {
      const requester = who(row.userId);
      const completedBy = who(row.completedById);
      return {
        ...this.requestView(row, "", "en"),
        contactPhone: row.contactPhone,
        contactWhatsapp: whatsappLink(row.contactPhone, ""),
        requester: requester ? { name: requester.fullName, email: requester.email, phone: requester.phone } : null,
        completedBy: completedBy ? completedBy.fullName || completedBy.email : null,
        history: historyOf(row.history),
      };
    });
  }

  // An administrator who called or messaged the requester records the outcome; the audit trail keeps who did it.
  async adminSetStatus(admin: UserRow, id: string, dto: AdminStatusDto) {
    const row = await this.db.bloodRequest.findUnique({ where: { id } });
    if (!row) throw new ApiError(404, NOT_FOUND);
    const status = dto.status as RequestStatus;
    const now = new Date();
    const entry: HistoryEntry = { at: now.toISOString(), status, source: "ADMIN", byId: admin.id, ...(dto.note ? { note: dto.note } : {}) };
    const completing = status === "COMPLETED" && row.status !== "COMPLETED";
    const updated = await this.db.$transaction(async (tx) => {
      const saved = await tx.bloodRequest.update({
        where: { id },
        data:
          status === "COMPLETED"
            ? {
                status,
                completedAt: row.completedAt ?? now,
                completedById: completing ? admin.id : row.completedById,
                completionSource: completing ? "ADMIN" : row.completionSource,
                history: this.withHistory(row, entry),
              }
            : { status, completedAt: null, completedById: null, completionSource: null, lastPromptedAt: null, history: this.withHistory(row, entry) },
      });
      if (completing)
        await tx.notification.create({
          data: userNotification("bloodRequestCompleted", row.userId, { reference: row.reference, patientName: row.patientName }, "en"),
        });
      return saved;
    });
    return { ...this.requestView(updated, "", "en"), history: historyOf(updated.history) };
  }
}
