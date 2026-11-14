import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { AppConfigService } from "../config/app-config.service.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { Prisma, SagunProfile } from "../generated/prisma/client.js";
import { indiaToday } from "../safar-saathi/safar.rules.js";
import type { SagunConfigDto, SagunInquiryActionDto, SagunInquiryDto, SagunReviewDto, SagunSaveDto, SagunSearchDto } from "./sagun.dto.js";
import { sagunFields } from "./sagun.fields.js";
import { ageOf, contactKeys, effectiveFields, fileKinds, type ProfileData, pick, publicKeys, sanitizeData } from "./sagun.rules.js";

@Injectable()
export class SagunService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: AppConfigService,
  ) {}
  private admin(user: UserRow) {
    if (user.role !== "admin" || user.status !== "active" || !user.isVerified) throw new ApiError(403, "SAGUN_ADMIN_REQUIRED");
  }
  private async member(user: UserRow) {
    if (user.status !== "active" || !user.isVerified || !user.email) throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
    if (user.role === "admin") return;
    const head = await this.db.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { id: true } });
    const member = await this.db.familyMember.findFirst({
      where: { email: user.email, status: { in: ["ACTIVE", "Active", "APPROVED"] }, family: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (!head && !member) throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
  }
  private async tx<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    for (let n = 0; ; n++) {
      try {
        return await this.db.$transaction(work, { isolationLevel: "Serializable", timeout: 15000 });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2034" || n >= 2) throw error;
      }
    }
  }
  private audit(tx: Db, user: UserRow, action: string, id: string) {
    return tx.sagunAudit.create({ data: { id: randomId(), actorId: user.id, action, entityId: id } });
  }
  private notice(tx: Db, userId: string, topic: string, id: string) {
    return tx.sagunNotice.create({ data: { id: randomId(), userId, topic, entityId: id } });
  }
  async schema() {
    const config = await this.db.sagunConfig.findUnique({ where: { id: "fields" } });
    return {
      fields: effectiveFields(config?.fields).map((field) => ({
        ...field,
        exposure: publicKeys.includes(field.key) ? "MEMBERS" : contactKeys.includes(field.key) ? "CONTACT" : field.section === "sagun" ? "SAGUN" : "OWNER",
      })),
      maxFileBytes: 10 * 1024 * 1024,
      sections: ["personal", "education", "contact", "family", "preferences", "sagun", "documents", "privacy"],
    };
  }
  async configure(input: SagunConfigDto, user: UserRow) {
    this.admin(user);
    const overrides: Prisma.InputJsonObject[] = [];
    for (const [key, value] of Object.entries(input.overrides)) {
      const field = sagunFields.find((field) => field.key === key);
      if (
        !field ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => !["en", "hi", "required", "enabled"].includes(key))
      )
        throw new ApiError(400, "SAGUN_CONFIG");
      if (
        (value.en !== undefined && (typeof value.en !== "string" || !value.en.trim() || value.en.length > 300)) ||
        (value.hi !== undefined && (typeof value.hi !== "string" || !value.hi.trim() || value.hi.length > 300)) ||
        [value.required, value.enabled].some((v) => v !== undefined && typeof v !== "boolean")
      )
        throw new ApiError(400, "SAGUN_CONFIG");
      if (field.locked && (value.enabled === false || (value.required !== undefined && value.required !== field.required)))
        throw new ApiError(400, "SAGUN_CONFIG_LOCKED");
      if (["sagun", "documents"].includes(field.section) && value.required) throw new ApiError(400, "SAGUN_OPTIONAL");
      overrides.push({ key, ...value });
    }
    await this.tx(async (tx) => {
      await tx.sagunConfig.upsert({ where: { id: "fields" }, create: { id: "fields", fields: overrides }, update: { fields: overrides } });
      await this.audit(tx, user, "CONFIGURE_FIELDS", "fields");
    });
    return this.schema();
  }
  private published(profile: SagunProfile) {
    const data = profile.data as ProfileData;
    return (
      profile.status === "APPROVED" &&
      profile.visibility === "MEMBERS" &&
      data.candidateConsent === true &&
      data.displayConsent === true &&
      data.termsConsent === true &&
      data.matrimonialConsent === true &&
      data.accuracyConsent === true
    );
  }
  private async owned(id: string, user: UserRow) {
    await this.member(user);
    const profile = await this.db.sagunProfile.findUnique({ where: { id }, include: { files: true } });
    if (!profile || (profile.userId !== user.id && user.role !== "admin")) throw new ApiError(404, "SAGUN_NOT_FOUND");
    return profile;
  }
  async mine(user: UserRow) {
    await this.member(user);
    const [profiles, incoming, outgoing, notices] = await Promise.all([
      this.db.sagunProfile.findMany({
        where: { userId: user.id },
        include: { files: { select: { id: true, kind: true, mime: true, size: true } } },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      this.db.sagunInquiry.findMany({
        where: { profile: { userId: user.id } },
        include: { user: { select: { id: true, fullName: true, phone: true, email: true, status: true } }, profile: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.db.sagunInquiry.findMany({ where: { userId: user.id }, include: { profile: true }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.db.sagunNotice.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return {
      profiles,
      incoming: incoming.map((row) => ({
        id: row.id,
        profileId: row.profileId,
        profileName: row.profile.displayName,
        senderName: row.user.fullName,
        message: row.message,
        status: row.status,
        shareSagun: row.shareSagun,
        contact: row.status === "ACCEPTED" && row.user.status === "active" ? { name: row.user.fullName, phone: row.user.phone, email: row.user.email } : null,
      })),
      outgoing: outgoing.map((row) => ({
        id: row.id,
        profileId: row.profileId,
        profileName: this.published(row.profile) ? row.profile.displayName : "",
        status: row.status,
        shareSagun: row.shareSagun,
      })),
      notices,
    };
  }
  async save(id: string | undefined, input: SagunSaveDto, user: UserRow) {
    await this.member(user);
    let owner = user;
    if (!id && input.ownerUserId && input.ownerUserId !== user.id) {
      this.admin(user);
      const found = await this.db.user.findUnique({ where: { id: input.ownerUserId } });
      if (!found) throw new ApiError(404, "SAGUN_NOT_FOUND");
      await this.member(found);
      owner = found;
    }
    const existing = id ? await this.owned(id, user) : null;
    const fields = (await this.schema()).fields;
    const raw = { ...input.data };
    if (existing) {
      for (const [kind, key] of Object.entries(fileKinds)) {
        const file = existing.files.find((file) => file.kind === kind);
        if (raw[key] && raw[key] !== file?.id) throw new ApiError(400, "SAGUN_FILE");
        if (file) raw[key] = file.id;
        else delete raw[key];
      }
    } else
      for (const key of Object.values(fileKinds)) {
        if (raw[key]) throw new ApiError(400, "SAGUN_FILE");
      }
    const data = sanitizeData(raw, fields, input.action === "SUBMIT");
    const old = (existing?.data || {}) as ProfileData;
    const actualOwner = existing?.userId || owner.id;
    if (
      actualOwner !== user.id &&
      ["candidateConsent", "displayConsent", "shareContact", "termsConsent", "matrimonialConsent", "accuracyConsent", "voluntaryConsent"].some(
        (key) => data[key] === true && old[key] !== true,
      )
    )
      throw new ApiError(400, "SAGUN_OWNER_CONSENT");
    const saved = await this.tx(async (tx) => {
      if (!existing && (await tx.sagunProfile.count({ where: { userId: owner.id } })) >= 10) throw new ApiError(429, "SAGUN_LIMIT");
      const values = {
        data: data as Prisma.InputJsonObject,
        displayName: String(data.fullName || ""),
        candidateType: String(data.candidateType || ""),
        birthDate: data.dob ? new Date(`${data.dob}T00:00:00Z`) : null,
        city: String(data.city || ""),
        gotra: String(data.gotra || ""),
        education: String(data.education || ""),
        occupation: String(data.occupation || ""),
        maritalStatus: String(data.maritalStatus || ""),
        visibility: String(data.visibility || "PRIVATE"),
        status: input.action === "SUBMIT" ? "PENDING" : "DRAFT",
        reviewNotes: null,
      };
      const row = existing
        ? await tx.sagunProfile.update({ where: { id: existing.id }, data: values })
        : await tx.sagunProfile.create({
            data: { ...values, id: randomId(), reference: `SAGUN-${randomId().replaceAll("-", "").slice(0, 12).toUpperCase()}`, userId: owner.id },
          });
      if (
        existing &&
        ["candidateConsent", "displayConsent", "shareContact", "termsConsent", "matrimonialConsent", "accuracyConsent"].some((key) => old[key] !== data[key])
      )
        await this.audit(tx, user, "CONSENT_CHANGED", row.id);
      if (existing && sagunFields.some((field) => field.section === "sagun" && JSON.stringify(old[field.key]) !== JSON.stringify(data[field.key])))
        await this.audit(tx, user, "SAGUN_DETAILS_CHANGED", row.id);
      await this.audit(tx, user, input.action === "SUBMIT" ? "SUBMIT_PROFILE" : "SAVE_DRAFT", row.id);
      if (input.action === "SUBMIT") await this.notice(tx, row.userId, "PROFILE_SUBMITTED", row.id);
      return row;
    });
    return saved;
  }
  async review(id: string, input: SagunReviewDto, user: UserRow) {
    this.admin(user);
    await this.member(user);
    const fields = (await this.schema()).fields;
    await this.tx(async (tx) => {
      const profile = await tx.sagunProfile.findUnique({ where: { id }, include: { files: true } });
      if (!profile) throw new ApiError(404, "SAGUN_NOT_FOUND");
      if (input.status === "APPROVED") {
        if (profile.status !== "PENDING") throw new ApiError(409, "SAGUN_STATE");
        const data = profile.data as ProfileData;
        sanitizeData(data, fields, true);
        if (!profile.files.some((file) => file.kind === "PHOTO" && file.id === data.photoFileId)) throw new ApiError(400, "SAGUN_FIELD:photoFileId");
      }
      await tx.sagunProfile.update({ where: { id }, data: { status: input.status, reviewNotes: input.notes || null } });
      await this.audit(tx, user, `REVIEW_${input.status}`, id);
      await this.notice(tx, profile.userId, "PROFILE_REVIEWED", id);
    });
    return { ok: true };
  }
  async deactivate(id: string, user: UserRow) {
    const profile = await this.owned(id, user);
    await this.tx(async (tx) => {
      await tx.sagunProfile.update({ where: { id }, data: { status: "DEACTIVATED" } });
      await this.audit(tx, user, "DEACTIVATE", profile.id);
    });
    return { ok: true };
  }
  async withdrawConsent(id: string, user: UserRow) {
    await this.owned(id, user);
    await this.tx(async (tx) => {
      const profile = await tx.sagunProfile.findUnique({ where: { id } });
      if (!profile || profile.userId !== user.id) throw new ApiError(403, "SAGUN_OWNER_REQUIRED");
      const data = {
        ...(profile.data as ProfileData),
        candidateConsent: false,
        matrimonialConsent: false,
        accuracyConsent: false,
        displayConsent: false,
        shareContact: false,
        termsConsent: false,
        visibility: "PRIVATE",
      };
      await tx.sagunProfile.update({ where: { id }, data: { data: data as Prisma.InputJsonObject, visibility: "PRIVATE", status: "DEACTIVATED" } });
      await tx.sagunInquiry.updateMany({ where: { profileId: id, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "DECLINED", shareSagun: false } });
      await this.audit(tx, user, "WITHDRAW_CONSENT", id);
    });
    return { ok: true };
  }
  async remove(id: string, user: UserRow) {
    const profile = await this.owned(id, user);
    await this.tx(async (tx) => {
      await tx.sagunProfile.delete({ where: { id } });
      await this.audit(tx, user, "DELETE_PROFILE", id);
    });
    for (const file of profile.files) await unlink(path.join(this.privateDir(), file.filename)).catch(() => undefined);
    return { ok: true };
  }
  private summary(profile: SagunProfile & { files?: { id: string; kind: string }[] }) {
    const data = profile.data as ProfileData;
    return {
      id: profile.id,
      reference: profile.reference,
      name: profile.displayName,
      candidateType: profile.candidateType,
      age: profile.birthDate ? ageOf(profile.birthDate.toISOString().slice(0, 10)) : null,
      height: data.height,
      education: profile.education,
      occupation: profile.occupation,
      city: profile.city,
      gotra: profile.gotra,
      maritalStatus: profile.maritalStatus,
      photoId: profile.files?.find((file) => file.kind === "PHOTO")?.id,
    };
  }
  async browse(query: SagunSearchDto, user: UserRow) {
    await this.member(user);
    if (query.minAge && query.maxAge && query.minAge > query.maxAge) throw new ApiError(400, "SAGUN_AGE_RANGE");
    const where: Prisma.SagunProfileWhereInput = {
      status: "APPROVED",
      visibility: "MEMBERS",
      user: { status: "active", isVerified: true },
      ...(query.candidateType ? { candidateType: query.candidateType } : {}),
      ...(query.maritalStatus ? { maritalStatus: query.maritalStatus } : {}),
    };
    for (const [key, value] of Object.entries({
      displayName: query.name,
      education: query.education,
      occupation: query.occupation,
      city: query.city,
      gotra: query.gotra,
    }))
      if (value) (where as Record<string, unknown>)[key] = { contains: value };
    if (query.minAge || query.maxAge) {
      const date = new Date(`${indiaToday()}T00:00:00Z`);
      const oldest = new Date(date);
      oldest.setUTCFullYear(oldest.getUTCFullYear() - (query.maxAge || 120) - 1);
      const newest = new Date(date);
      newest.setUTCFullYear(newest.getUTCFullYear() - (query.minAge || 18));
      where.birthDate = { gt: oldest, lte: newest };
    }
    const rows = await this.db.sagunProfile.findMany({
      where,
      include: { files: { where: { kind: "PHOTO" }, select: { id: true, kind: true } } },
      orderBy: { updatedAt: "desc" },
      skip: query.offset || 0,
      take: 13,
    });
    const records = rows
      .slice(0, 12)
      .filter((row) => this.published(row))
      .map((row) => this.summary(row));
    return { records, hasMore: rows.length > 12 };
  }
  async detail(id: string, user: UserRow) {
    await this.member(user);
    const profile = await this.db.sagunProfile.findUnique({
      where: { id },
      include: { files: { select: { id: true, kind: true, mime: true, size: true } }, user: { select: { status: true } } },
    });
    if (!profile) throw new ApiError(404, "SAGUN_NOT_FOUND");
    if (profile.userId === user.id || user.role === "admin") return profile;
    if (!this.published(profile) || profile.user.status !== "active") throw new ApiError(404, "SAGUN_NOT_FOUND");
    const inquiry = await this.db.sagunInquiry.findUnique({ where: { profileId_userId: { profileId: id, userId: user.id } } });
    const data = profile.data as ProfileData;
    const contact = inquiry?.status === "ACCEPTED" && data.shareContact === true ? pick(data, contactKeys) : null;
    const sagun =
      inquiry?.status === "ACCEPTED" && inquiry.shareSagun
        ? pick(
            data,
            sagunFields.filter((field) => field.section === "sagun").map((field) => field.key),
          )
        : null;
    if (contact || sagun) await this.audit(this.db, user, sagun ? "VIEW_SHARED_SAGUN" : "VIEW_SHARED_CONTACT", id);
    return { ...this.summary(profile), data: pick(data, publicKeys), contact, sagun, inquiryStatus: inquiry?.status || null };
  }
  async inquiry(id: string, input: SagunInquiryDto, user: UserRow) {
    await this.member(user);
    if (!input.consent || !input.message.trim()) throw new ApiError(400, "SAGUN_CONSENT");
    const profile = await this.db.sagunProfile.findUnique({ where: { id }, include: { user: { select: { status: true } } } });
    if (!profile || !this.published(profile) || profile.user.status !== "active" || profile.userId === user.id) throw new ApiError(404, "SAGUN_NOT_FOUND");
    return this.tx(async (tx) => {
      const old = await tx.sagunInquiry.findUnique({ where: { profileId_userId: { profileId: id, userId: user.id } } });
      if (old) return { id: old.id, status: old.status };
      if ((await tx.sagunInquiry.count({ where: { userId: user.id, status: "PENDING" } })) >= 20) throw new ApiError(429, "SAGUN_LIMIT");
      const row = await tx.sagunInquiry.create({ data: { id: randomId(), profileId: id, userId: user.id, message: input.message.trim() } });
      await this.audit(tx, user, "REQUEST_CONTACT", id);
      await this.notice(tx, profile.userId, "CONTACT_REQUEST", id);
      return { id: row.id, status: row.status };
    });
  }
  async inquiryAction(id: string, input: SagunInquiryActionDto, user: UserRow) {
    await this.member(user);
    await this.tx(async (tx) => {
      const row = await tx.sagunInquiry.findUnique({ where: { id }, include: { profile: true, user: true } });
      if (!row) throw new ApiError(404, "SAGUN_NOT_FOUND");
      if (input.action === "WITHDRAW") {
        if (row.userId !== user.id || !["PENDING", "ACCEPTED"].includes(row.status)) throw new ApiError(404, "SAGUN_NOT_FOUND");
        await tx.sagunInquiry.update({ where: { id }, data: { status: "WITHDRAWN", shareSagun: false } });
      } else {
        if (row.profile.userId !== user.id) throw new ApiError(403, "SAGUN_OWNER_REQUIRED");
        if (input.action === "ACCEPT" && (row.status !== "PENDING" || !this.published(row.profile) || row.user.status !== "active"))
          throw new ApiError(409, "SAGUN_STATE");
        if (["REVOKE", "UPDATE_GRANT"].includes(input.action) && row.status !== "ACCEPTED") throw new ApiError(409, "SAGUN_STATE");
        await tx.sagunInquiry.update({
          where: { id },
          data: {
            status: ["ACCEPT", "UPDATE_GRANT"].includes(input.action) ? "ACCEPTED" : "DECLINED",
            shareSagun: ["ACCEPT", "UPDATE_GRANT"].includes(input.action) && input.shareSagun === true,
          },
        });
      }
      await this.audit(tx, user, `CONTACT_${input.action}`, row.profileId);
      await this.notice(tx, row.userId === user.id ? row.profile.userId : row.userId, "CONTACT_UPDATED", row.profileId);
    });
    return { ok: true };
  }
  async adminData(user: UserRow) {
    this.admin(user);
    const [profiles, audits] = await Promise.all([
      this.db.sagunProfile.findMany({
        include: { files: { select: { id: true, kind: true, mime: true, size: true } } },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      this.db.sagunAudit.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    ]);
    return { profiles, audits };
  }
  private privateDir() {
    const root = path.resolve(
      process.env.SAGUN_PRIVATE_DIR || path.join(path.dirname(this.config.uploadsDir), `${path.basename(this.config.uploadsDir)}-sagun-private`),
    );
    if (root.split(path.sep).some((part) => ["public_html", "htdocs", "wwwroot"].includes(part))) throw new ApiError(500, "SAGUN_PRIVATE_STORAGE");
    const relative = path.relative(path.resolve(this.config.uploadsDir), root);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new ApiError(500, "SAGUN_PRIVATE_STORAGE");
    return root;
  }
  async upload(id: string, kind: string, file: Express.Multer.File | undefined, consent: string, user: UserRow) {
    await this.owned(id, user);
    if (!file || !fileKinds[kind] || consent !== "true") throw new ApiError(400, "SAGUN_UPLOAD_CONSENT");
    if (!file.size || file.size > 10 * 1024 * 1024) throw new ApiError(400, "SAGUN_FILE_SIZE");
    const png = file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255;
    const pdf = file.buffer.subarray(0, 5).toString() === "%PDF-";
    const mime = png ? "image/png" : jpg ? "image/jpeg" : pdf && kind !== "PHOTO" ? "application/pdf" : null;
    if (
      !mime ||
      file.mimetype !== mime ||
      !new RegExp(mime === "image/png" ? "\\.png$" : mime === "image/jpeg" ? "\\.jpe?g$" : "\\.pdf$", "i").test(file.originalname)
    )
      throw new ApiError(400, "SAGUN_FILE_TYPE");
    const root = this.privateDir();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const filename = `${randomId()}.${png ? "png" : jpg ? "jpg" : "pdf"}`;
    await writeFile(path.join(root, filename), file.buffer, { mode: 0o600, flag: "wx" });
    try {
      const record = await this.tx(async (tx) => {
        const current = await tx.sagunProfile.findUniqueOrThrow({ where: { id } });
        const old = await tx.sagunFile.findUnique({ where: { profileId_kind: { profileId: id, kind } } });
        const data = current.data as ProfileData;
        const uploaded = await tx.sagunFile.upsert({
          where: { profileId_kind: { profileId: id, kind } },
          create: { id: randomId(), profileId: id, kind, filename, mime, size: file.size },
          update: { id: randomId(), filename, mime, size: file.size, consentAt: new Date() },
        });
        await tx.sagunProfile.update({ where: { id }, data: { status: "DRAFT", data: { ...data, [fileKinds[kind]]: uploaded.id } as Prisma.InputJsonObject } });
        await this.audit(tx, user, `UPLOAD_${kind}`, id);
        return { uploaded, oldFilename: old?.filename };
      });
      if (record.oldFilename) await unlink(path.join(root, record.oldFilename)).catch(() => undefined);
      return { id: record.uploaded.id, kind: record.uploaded.kind, mime: record.uploaded.mime, size: record.uploaded.size };
    } catch (error) {
      await unlink(path.join(root, filename)).catch(() => undefined);
      throw error;
    }
  }
  async deleteFile(id: string, user: UserRow) {
    await this.member(user);
    const file = await this.db.sagunFile.findUnique({ where: { id }, include: { profile: true } });
    if (!file || (file.profile.userId !== user.id && user.role !== "admin")) throw new ApiError(404, "SAGUN_NOT_FOUND");
    await this.tx(async (tx) => {
      await tx.sagunFile.delete({ where: { id } });
      const latest = await tx.sagunProfile.findUniqueOrThrow({ where: { id: file.profileId } });
      const data = { ...(latest.data as ProfileData) };
      delete data[fileKinds[file.kind]];
      await tx.sagunProfile.update({ where: { id: file.profileId }, data: { data: data as Prisma.InputJsonObject, status: "DRAFT" } });
      await this.audit(tx, user, `DELETE_${file.kind}`, file.profileId);
    });
    await unlink(path.join(this.privateDir(), file.filename)).catch(() => undefined);
    return { ok: true };
  }
  async file(id: string, user: UserRow) {
    await this.member(user);
    const file = await this.db.sagunFile.findUnique({ where: { id }, include: { profile: { include: { user: { select: { status: true } } } } } });
    if (!file) throw new ApiError(404, "SAGUN_NOT_FOUND");
    const own = file.profile.userId === user.id || user.role === "admin";
    if (!own && (file.kind !== "PHOTO" || !this.published(file.profile) || file.profile.user.status !== "active")) throw new ApiError(404, "SAGUN_NOT_FOUND");
    if (file.kind !== "PHOTO") await this.audit(this.db, user, "READ_PRIVATE_DOCUMENT", file.profileId);
    try {
      return { buffer: await readFile(path.join(this.privateDir(), file.filename)), mime: file.mime, filename: file.filename };
    } catch {
      throw new ApiError(404, "SAGUN_NOT_FOUND");
    }
  }
}
