import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import { mobileDigits } from "../safar-saathi/safar.rules.js";
import type { AdminMrDto, AdminRequestDto, ReportDto, ReportUpdateDto, ResourceDto, ResourceUpdateDto, SehatMrDto, SehatRequestDto } from "./sehat.dto.js";
import { SehatProviders } from "./sehat.providers.js";
import { regionKey as routeKey } from "./sehat.rules.js";

const areas = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const openStates = ["PENDING", "IN_PROGRESS", "ASSISTANCE_FOUND"];
@Injectable()
export class SehatService {
  private notificationWorker?: ReturnType<typeof setInterval>;
  private flushing = false;
  onModuleInit() {
    this.notificationWorker = setInterval(() => {
      void this.flush();
    }, 30000);
    this.notificationWorker.unref();
    void this.flush();
  }
  onModuleDestroy() {
    if (this.notificationWorker) clearInterval(this.notificationWorker);
  }
  constructor(
    private readonly db: PrismaService,
    private readonly providers: SehatProviders,
  ) {}
  capabilities() {
    return this.providers.capabilities();
  }
  private admin(user: UserRow) {
    if (user.role !== "admin" || user.status !== "active") throw new ApiError(403, "SEHAT_ADMIN_REQUIRED");
  }
  private async member(user: UserRow, db: Db = this.db) {
    if (user.status !== "active" || !user.isVerified || !user.email) throw new ApiError(403, "SEHAT_MEMBERSHIP_REQUIRED");
    const family = await db.family.findFirst({ where: { email: user.email, status: "ACTIVE" } });
    const member = await db.familyMember.findFirst({
      where: { email: user.email, status: { in: ["ACTIVE", "Active", "APPROVED"] }, family: { status: "ACTIVE" } },
    });
    if (!family && !member && user.role !== "admin") throw new ApiError(403, "SEHAT_MEMBERSHIP_REQUIRED");
    return {
      name: user.fullName || member?.name || family?.headName || "",
      email: user.email,
      phone: mobileDigits(user.phone || member?.mobile || family?.contactNumber),
      phones: [user.phone, member?.mobile, family?.contactNumber].map(mobileDigits).filter(Boolean),
      membershipId: member?.membershipId || "",
    };
  }
  private async owner(actor: UserRow, ownerUserId?: string) {
    if (!ownerUserId || ownerUserId === actor.id) return actor;
    this.admin(actor);
    const user = await this.db.user.findUnique({ where: { id: ownerUserId } });
    if (!user) throw new ApiError(404, "SEHAT_NOT_FOUND");
    return user;
  }
  private async transaction<T>(work: (db: Db) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, { isolationLevel: "Serializable", timeout: 20000 });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
      }
    }
  }
  private audit(tx: Db, actor: string, action: string, entityType: string, entityId: string) {
    return tx.sehatAudit.create({ data: { id: randomId(), actorId: actor, action, entityType, entityId } });
  }
  private async notify(
    tx: Db,
    userId: string,
    topic: string,
    entityId: string,
    opt: { emailOptIn: boolean; whatsappOptIn: boolean },
    key = `${topic}:${entityId}`,
  ) {
    const caps = this.capabilities();
    const channels = [
      { channel: "IN_APP", status: "INBOX" },
      ...(opt.emailOptIn ? [{ channel: "EMAIL", status: caps.email ? "PENDING" : "UNAVAILABLE" }] : []),
      ...(opt.whatsappOptIn ? [{ channel: "WHATSAPP", status: caps.whatsapp ? "PENDING" : "UNAVAILABLE" }] : []),
    ];
    await tx.sehatNotification.createMany({
      skipDuplicates: true,
      data: channels.map((channel) => ({ ...channel, id: randomId(), userId, topic, entityId, dedupeKey: key })),
    });
  }
  private validChannels(opt: { whatsappOptIn: boolean; whatsapp?: string | null }) {
    if (opt.whatsappOptIn && !opt.whatsapp) throw new ApiError(400, "SEHAT_WHATSAPP_UNAVAILABLE");
  }
  private mrData(input: SehatMrDto) {
    const areaList = input.areas.map((area) => area.trim()).filter(Boolean);
    if (!areaList.length || !input.consent) throw new ApiError(400, "SEHAT_CONSENT");
    this.validChannels(input);
    return {
      name: input.name.trim(),
      membershipId: input.membershipId.trim(),
      company: input.company.trim(),
      role: input.role.trim(),
      city: input.city.trim(),
      cityKey: routeKey(input.city),
      areas: areaList,
      areaKeys: areaList.map(routeKey),
      phone: input.phone,
      whatsapp: input.whatsapp || null,
      assistance: input.assistance,
      publishContact: input.publishContact,
      emailOptIn: input.emailOptIn,
      whatsappOptIn: input.whatsappOptIn,
      lang: input.lang,
    };
  }
  private async membershipId(user: UserRow, membershipId: string, tx: Db = this.db) {
    const member = await tx.familyMember.findFirst({
      where: { membershipId: membershipId.trim(), email: user.email, status: { in: ["ACTIVE", "Active", "APPROVED"] }, family: { status: "ACTIVE" } },
    });
    if (!member) throw new ApiError(400, "SEHAT_MEMBERSHIP_ID");
  }
  async publicData() {
    const [resources, mrs] = await Promise.all([
      this.db.sehatResource.findMany({ where: { published: true, verified: true }, orderBy: { titleEn: "asc" }, take: 500 }),
      this.db.sehatMr.findMany({
        where: { status: "APPROVED", publishContact: true, user: { status: "active", isVerified: true } },
        select: { id: true, name: true, company: true, role: true, city: true, areas: true, phone: true, whatsapp: true, assistance: true, verifiedAt: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
    ]);
    return { resources, mrs, capabilities: this.capabilities(), limit: 500 };
  }
  async mine(user: UserRow) {
    const profile = await this.member(user);
    const [mr, requests, notifications, reports] = await Promise.all([
      this.db.sehatMr.findUnique({ where: { userId: user.id } }),
      this.db.sehatRequest.findMany({
        where: { userId: user.id },
        include: { assignedMr: { select: { name: true, phone: true, whatsapp: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.db.sehatNotification.findMany({
        where: { userId: user.id },
        select: { id: true, topic: true, entityId: true, channel: true, status: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.db.sehatReport.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const routes =
      mr?.status === "APPROVED"
        ? await this.db.sehatRouting.findMany({
            where: { mrId: mr.id, status: { in: ["INVITED", "ACCEPTED"] }, request: { status: { in: openStates } } },
            include: { request: true },
            take: 100,
            orderBy: { createdAt: "desc" },
          })
        : [];
    return {
      profile: { name: profile.name, phone: profile.phone, email: profile.email, membershipId: profile.membershipId },
      mr,
      requests: requests.map((request) => ({
        ...request,
        assignedMr: request.assignedMr?.status === "APPROVED" && request.status !== "PENDING" ? request.assignedMr : null,
      })),
      notifications,
      reports,
      routed: routes.map((route) => ({
        id: route.requestId,
        reference: route.request.reference,
        city: route.request.city,
        area: route.request.area,
        assistance: route.request.assistance,
        status: route.request.status,
        routingStatus: route.status,
        details:
          route.status === "ACCEPTED" && route.request.assignedMrId === mr?.id
            ? {
                medicine: route.request.medicine,
                composition: route.request.composition,
                quantity: route.request.quantity,
                notes: route.request.notes,
                name: route.request.name,
                phone: route.request.phone,
                whatsapp: route.request.whatsapp,
              }
            : null,
      })),
    };
  }
  private async deactivateMr(tx: Db, mrId: string) {
    const requests = await tx.sehatRequest.findMany({ where: { assignedMrId: mrId, status: { in: openStates } } });
    await tx.sehatRouting.updateMany({ where: { mrId }, data: { status: "WITHDRAWN" } });
    for (const request of requests) {
      await tx.sehatRequest.update({ where: { id: request.id }, data: { assignedMrId: null, status: "PENDING" } });
      await this.route(tx, request.id);
      await this.notify(tx, request.userId, "REASSIGNED", request.id, request, `REASSIGNED:${request.id}:${randomId()}`);
    }
  }
  async saveMr(input: SehatMrDto, actor: UserRow, id?: string) {
    let ownerUserId = input.ownerUserId;
    if (actor.role === "admin" && !ownerUserId) {
      const membership = await this.db.familyMember.findFirst({ where: { membershipId: input.membershipId.trim() } });
      const owner = membership?.email ? await this.db.user.findUnique({ where: { email: membership.email } }) : null;
      if (owner) ownerUserId = owner.id;
    }
    const user = await this.owner(actor, ownerUserId);
    await this.member(user);
    await this.membershipId(user, input.membershipId);
    if (actor.id !== user.id && (input.publishContact || input.emailOptIn || input.whatsappOptIn)) throw new ApiError(400, "SEHAT_OWNER_CONSENT");
    const data = this.mrData(input);
    return this.transaction(async (tx) => {
      const existing = id ? await tx.sehatMr.findUnique({ where: { id } }) : await tx.sehatMr.findUnique({ where: { userId: user.id } });
      if (existing && existing.userId !== user.id) throw new ApiError(403, "SEHAT_FORBIDDEN");
      // Profile edits revoke public verification until reviewed again.
      const mr = existing
        ? await tx.sehatMr.update({ where: { id: existing.id }, data: { ...data, status: "PENDING", verifiedAt: null, reviewNote: null } })
        : await tx.sehatMr.create({ data: { ...data, id: randomId(), userId: user.id } });
      if (existing) await this.deactivateMr(tx, mr.id);
      await this.audit(tx, actor.id, existing ? "UPDATE" : "CREATE", "MR", mr.id);
      return mr;
    });
  }
  private async route(tx: Db, requestId: string) {
    const request = await tx.sehatRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== "PENDING") return 0;
    const mrs = await tx.sehatMr.findMany({
      where: {
        status: "APPROVED",
        cityKey: request.cityKey,
        userId: { not: request.userId },
        user: { status: "active", isVerified: true },
        ...(request.assignedMrId ? { id: request.assignedMrId } : {}),
      },
    });
    let routed = 0;
    for (const mr of mrs) {
      if (
        !(areas(mr.areaKeys).includes("*") || areas(mr.areaKeys).includes(request.areaKey)) ||
        (mr.assistance !== "BOTH" && mr.assistance !== request.assistance)
      )
        continue;
      const exists = await tx.sehatRouting.findUnique({ where: { requestId_mrId: { requestId, mrId: mr.id } } });
      if (exists && exists.status !== "WITHDRAWN") continue;
      if (exists) {
        await tx.sehatRouting.update({ where: { id: exists.id }, data: { status: "INVITED" } });
        await this.notify(tx, mr.userId, "REQUEST_AVAILABLE", requestId, mr, `REQUEST_AVAILABLE:${requestId}:${randomId()}`);
        routed++;
        continue;
      }
      await tx.sehatRouting.create({ data: { id: randomId(), requestId, mrId: mr.id } });
      await this.notify(tx, mr.userId, "REQUEST_AVAILABLE", requestId, mr);
      routed++;
    }
    return routed;
  }
  private async requestData(input: SehatRequestDto, user: UserRow) {
    const member = await this.member(user);
    if (!input.consent) throw new ApiError(400, "SEHAT_CONSENT");
    if (!member.phones.includes(input.phone) || (input.whatsapp && !member.phones.includes(input.whatsapp))) throw new ApiError(400, "SEHAT_REGISTERED_MOBILE");
    this.validChannels(input);
    return {
      medicine: input.medicine.trim(),
      composition: input.composition?.trim() || null,
      quantity: input.quantity,
      assistance: input.assistance,
      city: input.city.trim(),
      cityKey: routeKey(input.city),
      area: input.area.trim(),
      areaKey: routeKey(input.area),
      name: input.name.trim(),
      phone: input.phone,
      whatsapp: input.whatsapp || null,
      notes: input.notes?.trim() || null,
      emailOptIn: input.emailOptIn,
      whatsappOptIn: input.whatsappOptIn,
      lang: input.lang,
    };
  }
  async createRequest(input: SehatRequestDto, actor: UserRow) {
    const user = await this.owner(actor, input.ownerUserId);
    if (actor.id !== user.id && (input.emailOptIn || input.whatsappOptIn)) throw new ApiError(400, "SEHAT_OWNER_CONSENT");
    const data = await this.requestData(input, user);
    const result = await this.transaction(async (tx) => {
      const existing = await tx.sehatRequest.findUnique({ where: { userId_clientRequestId: { userId: user.id, clientRequestId: input.clientRequestId } } });
      if (existing) return { id: existing.id, reference: existing.reference };
      if ((await tx.sehatRequest.count({ where: { userId: user.id, status: { in: openStates } } })) >= 10) throw new ApiError(429, "SEHAT_REQUEST_LIMIT");
      const record = await tx.sehatRequest.create({
        data: {
          ...data,
          id: randomId(),
          reference: `SEHAT-${randomId().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
          clientRequestId: input.clientRequestId,
          userId: user.id,
        },
      });
      await this.route(tx, record.id);
      await this.audit(tx, actor.id, "CREATE", "REQUEST", record.id);
      await this.notify(tx, user.id, "REQUEST_SAVED", record.id, record);
      return { id: record.id, reference: record.reference };
    });
    void this.flush();
    return result;
  }
  async mrAction(id: string, action: string, user: UserRow) {
    await this.member(user);
    await this.transaction(async (tx) => {
      const mr = await tx.sehatMr.findUnique({ where: { userId: user.id } });
      if (mr?.status !== "APPROVED") throw new ApiError(403, "SEHAT_MR_REQUIRED");
      const route = await tx.sehatRouting.findUnique({ where: { requestId_mrId: { requestId: id, mrId: mr.id } } });
      const request = await tx.sehatRequest.findUnique({ where: { id } });
      if (!request || !route) throw new ApiError(404, "SEHAT_NOT_FOUND");
      if (action === "DECLINE" && route.status === "INVITED") {
        await tx.sehatRouting.update({ where: { id: route.id }, data: { status: "DECLINED" } });
        if (request.assignedMrId === mr.id) {
          await tx.sehatRequest.update({ where: { id }, data: { assignedMrId: null } });
          await this.route(tx, id);
          await this.notify(tx, request.userId, "REASSIGNED", id, request, `REASSIGNED:${id}:${randomId()}`);
        }
        await this.audit(tx, user.id, "DECLINE", "REQUEST", id);
        return;
      }
      if (action === "ACCEPT") {
        if (route.status !== "INVITED" || request.status !== "PENDING" || (request.assignedMrId && request.assignedMrId !== mr.id))
          throw new ApiError(409, "SEHAT_CONFLICT");
        const claimed = await tx.sehatRequest.updateMany({
          where: { id, status: "PENDING", OR: [{ assignedMrId: null }, { assignedMrId: mr.id }] },
          data: { assignedMrId: mr.id, status: "IN_PROGRESS" },
        });
        if (!claimed.count) throw new ApiError(409, "SEHAT_CONFLICT");
        await tx.sehatRouting.updateMany({ where: { requestId: id }, data: { status: "WITHDRAWN" } });
        await tx.sehatRouting.update({ where: { id: route.id }, data: { status: "ACCEPTED" } });
      } else {
        if (
          request.assignedMrId !== mr.id ||
          route.status !== "ACCEPTED" ||
          (action === "ASSISTANCE_FOUND" ? request.status !== "IN_PROGRESS" : !["IN_PROGRESS", "ASSISTANCE_FOUND"].includes(request.status))
        )
          throw new ApiError(409, "SEHAT_CONFLICT");
        await tx.sehatRequest.update({ where: { id }, data: { status: action } });
      }
      await this.audit(tx, user.id, action, "REQUEST", id);
      await this.notify(tx, request.userId, action === "ACCEPT" ? "MR_ASSIGNED" : action, id, request);
    });
    void this.flush();
    return { ok: true };
  }
  async closeRequest(id: string, user: UserRow) {
    await this.member(user);
    await this.transaction(async (tx) => {
      const request = await tx.sehatRequest.findUnique({ where: { id } });
      if (!request || request.userId !== user.id) throw new ApiError(404, "SEHAT_NOT_FOUND");
      if (!openStates.includes(request.status)) throw new ApiError(409, "SEHAT_CONFLICT");
      await tx.sehatRequest.update({ where: { id }, data: { status: "CLOSED" } });
      await tx.sehatRouting.updateMany({ where: { requestId: id }, data: { status: "WITHDRAWN" } });
      await this.audit(tx, user.id, "CLOSE", "REQUEST", id);
    });
    return { ok: true };
  }
  async report(input: ReportDto, user: UserRow) {
    await this.member(user);
    const exists =
      input.targetType === "MR"
        ? await this.db.sehatMr.findUnique({ where: { id: input.targetId } })
        : input.targetType === "RESOURCE"
          ? await this.db.sehatResource.findUnique({ where: { id: input.targetId } })
          : await this.db.sehatRequest.findFirst({
              where: { id: input.targetId, ...(user.role === "admin" ? {} : { OR: [{ userId: user.id }, { assignedMr: { userId: user.id } }] }) },
            });
    if (!exists) throw new ApiError(404, "SEHAT_NOT_FOUND");
    if ((await this.db.sehatReport.count({ where: { userId: user.id, status: "OPEN" } })) >= 20) throw new ApiError(429, "SEHAT_REQUEST_LIMIT");
    return this.transaction(async (tx) => {
      const report = await tx.sehatReport.create({ data: { id: randomId(), userId: user.id, ...input } });
      await this.audit(tx, user.id, "CREATE", "REPORT", report.id);
      return report;
    });
  }
  async adminData(user: UserRow) {
    this.admin(user);
    const [mrs, resources, requests, reports, notifications, audits] = await Promise.all([
      this.db.sehatMr.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      this.db.sehatResource.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      this.db.sehatRequest.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      this.db.sehatReport.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      this.db.sehatNotification.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      this.db.sehatAudit.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    ]);
    return { mrs, resources, requests, reports, notifications, audits, limit: 500 };
  }
  async adminMr(id: string, input: AdminMrDto, actor: UserRow) {
    this.admin(actor);
    const old = await this.db.sehatMr.findUnique({ where: { id } });
    if (!old) throw new ApiError(404, "SEHAT_NOT_FOUND");
    const owner = await this.db.user.findUniqueOrThrow({ where: { id: old.userId } });
    await this.member(owner);
    await this.membershipId(owner, input.membershipId || old.membershipId);
    const data = this.mrData({ ...old, areas: areas(old.areas), whatsapp: old.whatsapp || undefined, ...input, consent: true });
    if (actor.id !== old.userId) {
      if (
        ["publishContact", "emailOptIn", "whatsappOptIn"].some(
          (key) => input[key as keyof AdminMrDto] === true && !old[key as "publishContact" | "emailOptIn" | "whatsappOptIn"],
        )
      )
        throw new ApiError(400, "SEHAT_OWNER_CONSENT");
      if (data.phone !== old.phone || data.whatsapp !== old.whatsapp) data.publishContact = false;
      if (data.whatsapp !== old.whatsapp) data.whatsappOptIn = false;
    }
    await this.transaction(async (tx) => {
      const status = input.status || old.status;
      const mr = await tx.sehatMr.update({
        where: { id },
        data: { ...data, status, reviewNote: input.reviewNote, verifiedAt: status === "APPROVED" ? new Date() : null },
      });
      await this.audit(tx, actor.id, `REVIEW_${status}`, "MR", id);
      await this.notify(tx, old.userId, "MR_REVIEWED", id, mr, `MR_REVIEWED:${id}:${randomId()}`);
      if (status === "APPROVED") {
        for (const request of await tx.sehatRequest.findMany({ where: { cityKey: mr.cityKey, status: "PENDING" } })) await this.route(tx, request.id);
      } else {
        await this.deactivateMr(tx, id);
      }
    });
    void this.flush();
    return { ok: true };
  }
  async saveResource(input: ResourceDto | ResourceUpdateDto, actor: UserRow, id?: string) {
    this.admin(actor);
    return this.transaction(async (tx) => {
      const old = id ? await tx.sehatResource.findUnique({ where: { id } }) : null;
      if (id && !old) throw new ApiError(404, "SEHAT_NOT_FOUND");
      const data = { ...old, ...input };
      if (data.published && !data.verified) throw new ApiError(400, "SEHAT_RESOURCE_VERIFY");
      const record = id
        ? await tx.sehatResource.update({ where: { id }, data: { ...input, verifiedAt: data.verified ? new Date() : null } })
        : await tx.sehatResource.create({ data: { ...(input as ResourceDto), id: randomId(), verifiedAt: input.verified ? new Date() : null } });
      await this.audit(tx, actor.id, id ? "UPDATE" : "CREATE", "RESOURCE", record.id);
      return record;
    });
  }
  async adminRequest(id: string, input: AdminRequestDto, actor: UserRow) {
    this.admin(actor);
    const old = await this.db.sehatRequest.findUnique({ where: { id } });
    if (!old) throw new ApiError(404, "SEHAT_NOT_FOUND");
    const owner = await this.db.user.findUniqueOrThrow({ where: { id: old.userId } });
    const data = await this.requestData(
      { ...old, composition: old.composition || undefined, whatsapp: old.whatsapp || undefined, notes: old.notes || undefined, ...input, consent: true },
      owner,
    );
    if (actor.id !== old.userId) {
      if ((input.emailOptIn === true && !old.emailOptIn) || (input.whatsappOptIn === true && !old.whatsappOptIn))
        throw new ApiError(400, "SEHAT_OWNER_CONSENT");
      if (data.whatsapp !== old.whatsapp) data.whatsappOptIn = false;
    }
    await this.transaction(async (tx) => {
      const assignedMrId = input.assignedMrId === undefined ? old.assignedMrId : input.assignedMrId || null;
      const assignmentChanged = assignedMrId !== old.assignedMrId;
      const status = assignmentChanged ? "PENDING" : input.status || old.status;
      if (["IN_PROGRESS", "ASSISTANCE_FOUND"].includes(status)) {
        const accepted = assignedMrId ? await tx.sehatRouting.findUnique({ where: { requestId_mrId: { requestId: id, mrId: assignedMrId } } }) : null;
        if (accepted?.status !== "ACCEPTED") throw new ApiError(409, "SEHAT_ACCEPT_REQUIRED");
      }
      if (assignedMrId) {
        const mr = await tx.sehatMr.findUnique({ where: { id: assignedMrId } });
        if (
          mr?.status !== "APPROVED" ||
          mr.userId === owner.id ||
          mr.cityKey !== data.cityKey ||
          !(areas(mr.areaKeys).includes("*") || areas(mr.areaKeys).includes(data.areaKey)) ||
          (mr.assistance !== "BOTH" && mr.assistance !== data.assistance)
        )
          throw new ApiError(400, "SEHAT_ASSIGNMENT");
      }
      await tx.sehatRequest.update({ where: { id }, data: { ...data, assignedMrId, status } });
      if (assignmentChanged || ["CLOSED", "REJECTED"].includes(status))
        await tx.sehatRouting.updateMany({ where: { requestId: id }, data: { status: "WITHDRAWN" } });
      if (assignmentChanged && assignedMrId) await tx.sehatRouting.deleteMany({ where: { requestId: id, mrId: assignedMrId } });
      if (status === "PENDING") await this.route(tx, id);
      await this.audit(tx, actor.id, "UPDATE_ASSIGN", "REQUEST", id);
      await this.notify(tx, old.userId, status, id, data, `${status}:${id}:${randomId()}`);
    });
    void this.flush();
    return { ok: true };
  }
  async adminReport(id: string, input: ReportUpdateDto, user: UserRow) {
    this.admin(user);
    return this.transaction(async (tx) => {
      const old = await tx.sehatReport.findUnique({ where: { id } });
      if (!old) throw new ApiError(404, "SEHAT_NOT_FOUND");
      const result = await tx.sehatReport.update({ where: { id }, data: input });
      await this.audit(tx, user.id, "UPDATE", "REPORT", id);
      return result;
    });
  }
  async remove(type: string, id: string, user: UserRow) {
    this.admin(user);
    await this.transaction(async (tx) => {
      if (type === "mrs") {
        await tx.sehatMr.updateMany({ where: { id }, data: { status: "SUSPENDED" } });
        await this.deactivateMr(tx, id);
        await tx.sehatMr.deleteMany({ where: { id } });
      } else if (type === "resources") await tx.sehatResource.deleteMany({ where: { id } });
      else if (type === "requests") await tx.sehatRequest.deleteMany({ where: { id } });
      else if (type === "reports") await tx.sehatReport.deleteMany({ where: { id } });
      else if (type === "notifications") await tx.sehatNotification.deleteMany({ where: { id } });
      else throw new ApiError(400, "SEHAT_NOT_FOUND");
      await this.audit(tx, user.id, "DELETE", type, id);
    });
    void this.flush();
    return { ok: true };
  }
  async retryNotice(id: string, user: UserRow) {
    this.admin(user);
    const record = await this.db.sehatNotification.findUnique({ where: { id } });
    if (!record || !["FAILED", "UNAVAILABLE"].includes(record.status)) throw new ApiError(409, "SEHAT_CONFLICT");
    await this.db.sehatNotification.update({ where: { id }, data: { status: "PENDING" } });
    await this.audit(this.db, user.id, "RETRY", "NOTIFICATION", id);
    void this.flush();
    return { ok: true };
  }
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    // Claim persisted outbox rows once. No medical information is sent externally.
    try {
      const pending = await this.db.sehatNotification.findMany({ where: { status: "PENDING" }, include: { user: true }, take: 100 });
      for (const row of pending) {
        const mr = await this.db.sehatMr.findUnique({ where: { userId: row.userId } });
        const request = await this.db.sehatRequest.findFirst({ where: { id: row.entityId, userId: row.userId } });
        const preferences = row.topic === "REQUEST_AVAILABLE" || row.topic === "MR_REVIEWED" ? mr : request;
        const opted = row.channel === "EMAIL" ? preferences?.emailOptIn : preferences?.whatsappOptIn;
        const invitation =
          row.topic === "REQUEST_AVAILABLE" && mr
            ? await this.db.sehatRouting.findUnique({ where: { requestId_mrId: { requestId: row.entityId, mrId: mr.id } } })
            : null;
        const staleInvitation = row.topic === "REQUEST_AVAILABLE" && (mr?.status !== "APPROVED" || invitation?.status !== "INVITED");
        if (!opted || row.user.status !== "active" || staleInvitation) {
          await this.db.sehatNotification.update({ where: { id: row.id }, data: { status: "SKIPPED" } });
          continue;
        }
        if (!(await this.db.sehatNotification.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "SENDING" } })).count) continue;
        try {
          const result = await this.providers.send(row.channel, {
            email: row.user.email,
            phone: preferences?.whatsapp || null,
            lang: preferences?.lang || "hi",
          });
          await this.db.sehatNotification.update({ where: { id: row.id }, data: result });
        } catch {
          await this.db.sehatNotification.update({ where: { id: row.id }, data: { status: "FAILED" } });
        }
      }
    } catch {
      /* Persistent inbox records remain available if a provider fails. */
    } finally {
      this.flushing = false;
    }
  }
}
