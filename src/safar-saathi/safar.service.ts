import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import { MailService } from "../common/mail/mail.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { AppConfigService } from "../config/app-config.service.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { SafarEntry } from "../generated/prisma/client.js";
import type { CreateSafarDto } from "./safar.dto.js";
import { compatibleType, indiaToday, mobileDigits, routeKey, validTravelDate } from "./safar.rules.js";

@Injectable()
export class SafarService {
  constructor(
    private readonly db: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}
  capabilities() {
    return { email: this.mail.isConfigured(), sms: false, inApp: true };
  }

  private async member(user: UserRow) {
    if (user.status !== "active" || !user.isVerified || !user.email) throw new ApiError(403, "SAFAR_MEMBERSHIP_REQUIRED");
    const family = await this.db.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { contactNumber: true } });
    const member = await this.db.familyMember.findFirst({
      where: { email: user.email, status: { in: ["ACTIVE", "Active", "APPROVED"] }, family: { status: "ACTIVE" } },
      select: { mobile: true },
    });
    if (!family && !member && user.role !== "admin") throw new ApiError(403, "SAFAR_MEMBERSHIP_REQUIRED");
    return [user.phone, family?.contactNumber, member?.mobile].map(mobileDigits).filter(Boolean);
  }
  // Serializable range reads avoid missing a pair when request and offer arrive concurrently.
  private async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, { isolationLevel: "Serializable", timeout: 15000 });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
      }
    }
  }
  private async notices(tx: Db, matchId: string, kind: string, entries: SafarEntry[]) {
    await tx.safarNotice.createMany({
      skipDuplicates: true,
      data: entries.map((entry) => ({
        id: randomId(),
        userId: entry.userId,
        matchId,
        kind,
        emailStatus: entry.notificationMethod === "EMAIL" ? (this.mail.isConfigured() ? "PENDING" : "UNAVAILABLE") : "NOT_REQUESTED",
      })),
    });
  }

  async create(dto: CreateSafarDto, user: UserRow) {
    const phones = await this.member(user);
    if (!dto.consent) throw new ApiError(400, "SAFAR_CONSENT");
    if (!phones.includes(dto.phone)) throw new ApiError(400, "SAFAR_REGISTERED_MOBILE");
    if (!validTravelDate(dto.travelDate)) throw new ApiError(400, "SAFAR_FUTURE_DATE");
    const originKey = routeKey(dto.origin);
    const destinationKey = routeKey(dto.destination);
    if (!originKey || !destinationKey || originKey === destinationKey) throw new ApiError(400, "SAFAR_DIFFERENT_ROUTE");
    if (dto.kind === "REQUEST" && dto.requestType === "BOTH") throw new ApiError(400, "SAFAR_REQUEST_TYPE");
    if (dto.kind === "OFFER" && dto.requestType === "URGENT") throw new ApiError(400, "SAFAR_REQUEST_TYPE");
    if (dto.kind === "REQUEST" && dto.requestType === "DELIVERY" && !dto.itemDetails?.trim()) throw new ApiError(400, "SAFAR_ITEM_REQUIRED");
    if (dto.email && dto.email.trim().toLowerCase() !== user.email?.toLowerCase()) throw new ApiError(400, "SAFAR_REGISTERED_EMAIL");
    if (dto.notificationMethod === "EMAIL" && !this.mail.isConfigured()) throw new ApiError(400, "SAFAR_EMAIL_UNAVAILABLE");
    const result = await this.transaction(async (tx) => {
      const existing = await tx.safarEntry.findUnique({ where: { userId_clientRequestId: { userId: user.id, clientRequestId: dto.clientRequestId } } });
      if (existing) return { id: existing.id, matches: await tx.safarMatch.count({ where: { OR: [{ requestId: existing.id }, { offerId: existing.id }] } }) };
      if ((await tx.safarEntry.count({ where: { userId: user.id, status: "OPEN", travelDate: { gte: new Date(`${indiaToday()}T00:00:00Z`) } } })) >= 20)
        throw new ApiError(429, "SAFAR_OPEN_LIMIT");
      const entry = await tx.safarEntry.create({
        data: {
          id: randomId(),
          clientRequestId: dto.clientRequestId,
          userId: user.id,
          kind: dto.kind,
          requestType: dto.requestType,
          name: dto.name.trim(),
          phone: dto.phone,
          email: user.email,
          origin: dto.origin.trim(),
          destination: dto.destination.trim(),
          originKey,
          destinationKey,
          travelDate: new Date(`${dto.travelDate}T00:00:00Z`),
          preferredTime: dto.preferredTime,
          itemDetails: dto.itemDetails?.trim() || null,
          instructions: dto.instructions?.trim() || null,
          notificationMethod: dto.notificationMethod,
          lang: dto.lang,
        },
      });
      const candidates = await tx.safarEntry.findMany({
        where: {
          kind: dto.kind === "REQUEST" ? "OFFER" : "REQUEST",
          status: "OPEN",
          userId: { not: user.id },
          originKey,
          destinationKey,
          travelDate: entry.travelDate,
          user: { status: "active", isVerified: true },
          ...(dto.kind === "OFFER" ? { requests: { none: { status: "CONFIRMED" } } } : {}),
        },
      });
      let matches = 0;
      for (const other of candidates) {
        const request = entry.kind === "REQUEST" ? entry : other;
        const offer = entry.kind === "OFFER" ? entry : other;
        if (!compatibleType(request.requestType, offer.requestType)) continue;
        const match = await tx.safarMatch.create({ data: { id: randomId(), requestId: request.id, offerId: offer.id } });
        await this.notices(tx, match.id, "PROPOSED", [request, offer]);
        matches++;
      }
      return { id: entry.id, matches };
    });
    await this.safeDeliverEmails(user.id);
    // New matches notify the other party too; destinations are registered accounts only.
    const matches = await this.db.safarMatch.findMany({
      where: { OR: [{ requestId: result.id }, { offerId: result.id }] },
      include: { request: true, offer: true },
    });
    for (const id of new Set(matches.flatMap((match) => [match.request.userId, match.offer.userId]))) if (id !== user.id) await this.safeDeliverEmails(id);
    return result;
  }

  async mine(user: UserRow) {
    const phones = await this.member(user);
    const entries = await this.db.safarEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
    const matches = await this.db.safarMatch.findMany({
      where: { OR: [{ request: { userId: user.id } }, { offer: { userId: user.id } }] },
      include: { request: { include: { user: { select: { status: true } } } }, offer: { include: { user: { select: { status: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const notices = await this.db.safarNotice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
    return {
      profile: { name: user.fullName || "", phone: phones[0] || "", email: user.email || "" },
      entries,
      matches: matches.map((match) => {
        const isRequest = match.request.userId === user.id;
        const other = isRequest ? match.offer : match.request;
        const shared = ["CONFIRMED", "COMPLETED"].includes(match.status) && other.user.status === "active";
        return {
          id: match.id,
          status: match.status,
          ownEntryId: isRequest ? match.requestId : match.offerId,
          acceptedByMe: isRequest ? match.requestAccepted : match.offerAccepted,
          acceptedByOther: isRequest ? match.offerAccepted : match.requestAccepted,
          origin: other.origin,
          destination: other.destination,
          travelDate: other.travelDate,
          preferredTime: other.preferredTime,
          requestType: match.request.requestType,
          contact: shared
            ? { name: other.name, phone: other.phone, email: other.email, itemDetails: other.itemDetails, instructions: other.instructions }
            : null,
        };
      }),
      notices,
      historyLimit: 100,
    };
  }

  async cancel(id: string, user: UserRow) {
    await this.member(user);
    const parties = await this.transaction(async (tx) => {
      const entry = await tx.safarEntry.findUnique({ where: { id } });
      if (!entry || entry.userId !== user.id) throw new ApiError(404, "SAFAR_NOT_FOUND");
      if (entry.status !== "OPEN") throw new ApiError(409, "SAFAR_INVALID_STATE");
      await tx.safarEntry.update({ where: { id }, data: { status: "CANCELLED" } });
      const matches = await tx.safarMatch.findMany({
        where: { OR: [{ requestId: id }, { offerId: id }], status: { in: ["PROPOSED", "CONFIRMED"] } },
        include: { request: true, offer: true },
      });
      for (const match of matches) {
        await tx.safarMatch.update({ where: { id: match.id }, data: { status: "CANCELLED" } });
        await this.notices(tx, match.id, "CANCELLED", [match.request, match.offer]);
      }
      return [...new Set(matches.flatMap((match) => [match.request.userId, match.offer.userId]))];
    });
    for (const id of parties) await this.safeDeliverEmails(id);
    return { status: "CANCELLED" };
  }

  async decide(id: string, decision: string, user: UserRow) {
    await this.member(user);
    const result = await this.transaction(async (tx) => {
      const match = await tx.safarMatch.findUnique({ where: { id }, include: { request: true, offer: true } });
      if (!match || ![match.request.userId, match.offer.userId].includes(user.id)) throw new ApiError(404, "SAFAR_NOT_FOUND");
      if (
        match.request.status !== "OPEN" ||
        match.offer.status !== "OPEN" ||
        (decision === "ACCEPT" && match.request.travelDate.toISOString().slice(0, 10) < indiaToday())
      )
        throw new ApiError(409, "SAFAR_INVALID_STATE");
      const isRequest = match.request.userId === user.id;
      const affected = new Set([match.request.userId, match.offer.userId]);
      if (decision === "ACCEPT") {
        if (match.status !== "PROPOSED") throw new ApiError(409, "SAFAR_INVALID_STATE");
        await tx.safarMatch.update({ where: { id }, data: isRequest ? { requestAccepted: true } : { offerAccepted: true } });
        const current = await tx.safarMatch.findUniqueOrThrow({ where: { id } });
        if (current.requestAccepted && current.offerAccepted) {
          await tx.safarMatch.update({ where: { id }, data: { status: "CONFIRMED" } });
          // A request may coordinate with only one accepted traveller.
          const alternatives = await tx.safarMatch.findMany({
            where: { requestId: match.requestId, id: { not: id }, status: { in: ["PROPOSED", "CONFIRMED"] } },
            include: { request: true, offer: true },
          });
          for (const other of alternatives) {
            affected.add(other.request.userId);
            affected.add(other.offer.userId);
            await tx.safarMatch.update({ where: { id: other.id }, data: { status: "CANCELLED" } });
            await this.notices(tx, other.id, "CANCELLED", [other.request, other.offer]);
          }
          await this.notices(tx, id, "CONFIRMED", [match.request, match.offer]);
        }
      } else {
        if (decision === "COMPLETE" ? match.status !== "CONFIRMED" : !["PROPOSED", "CONFIRMED"].includes(match.status))
          throw new ApiError(409, "SAFAR_INVALID_STATE");
        const status = decision === "COMPLETE" ? "COMPLETED" : "DECLINED";
        await tx.safarMatch.update({ where: { id }, data: { status } });
        if (decision === "COMPLETE") await tx.safarEntry.update({ where: { id: match.requestId }, data: { status: "COMPLETED" } });
        await this.notices(tx, id, status, [match.request, match.offer]);
      }
      return { users: [...affected] };
    });
    for (const id of result.users) await this.safeDeliverEmails(id);
    return { ok: true };
  }

  private async safeDeliverEmails(userId: string) {
    try {
      await this.deliverEmails(userId);
    } catch {
      /* Pending notices remain available in the private inbox. */
    }
  }

  private async deliverEmails(userId: string) {
    const pending = await this.db.safarNotice.findMany({
      where: { userId, emailStatus: "PENDING" },
      include: { user: true, match: { include: { request: true, offer: true } } },
    });
    for (const notice of pending) {
      if (!(await this.db.safarNotice.updateMany({ where: { id: notice.id, emailStatus: "PENDING" }, data: { emailStatus: "SENDING" } })).count) continue;
      const own = notice.match.request.userId === userId ? notice.match.request : notice.match.offer;
      try {
        const url = new URL("/transportation", this.config.frontendUrl).href;
        const states: Record<string, string[]> = {
          PROPOSED: ["Possible match found", "संभावित साथी मिला"],
          CONFIRMED: ["Both members accepted", "दोनों सदस्यों ने स्वीकार किया"],
          DECLINED: ["Match declined", "मिलान अस्वीकृत"],
          CANCELLED: ["Coordination cancelled", "समन्वय रद्द"],
          COMPLETED: ["Coordination completed", "समन्वय पूर्ण"],
        };
        const state = states[notice.kind]?.[own.lang === "hi" ? 1 : 0] || notice.kind;
        if (!notice.user.email || notice.user.status !== "active") {
          await this.db.safarNotice.update({ where: { id: notice.id }, data: { emailStatus: "UNAVAILABLE" } });
          continue;
        }
        const text =
          own.lang === "hi"
            ? `सफ़र साथी: आपकी यात्रा के समन्वय में नई सूचना है। स्थिति: ${state}। निजी विवरण और समन्वय के लिए अपने खाते में लॉगिन करें: ${url}`
            : `Safar Saathi: there is an update to your travel coordination. Status: ${state}. Sign in to see private details and coordinate: ${url}`;
        const result = await this.mail.send({
          to: notice.user.email,
          subject: own.lang === "hi" ? "सफ़र साथी — यात्रा सूचना" : "Safar Saathi — travel update",
          text,
          html: `<p>${text}</p>`,
        });
        const skipped = (result as { skipped?: boolean } | null)?.skipped;
        await this.db.safarNotice.update({ where: { id: notice.id }, data: { emailStatus: skipped ? "UNAVAILABLE" : "SENT" } });
      } catch {
        await this.db.safarNotice.update({ where: { id: notice.id }, data: { emailStatus: "FAILED" } });
      }
    }
  }
}
