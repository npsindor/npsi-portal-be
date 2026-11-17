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
import { ensureDigitalCard } from "../sagun-cards/sagun-card.records.js";
import type {
  SagunAdminEditDto,
  SagunAdminListDto,
  SagunConfigDto,
  SagunInquiryActionDto,
  SagunInquiryDto,
  SagunReviewDto,
  SagunSaveDto,
  SagunSearchDto,
  SagunSettingsDto,
} from "./sagun.dto.js";
import {
  candidateTypeOf,
  DEFAULT_SETTINGS,
  eligibilityError,
  evaluateMember,
  genderOf,
  isoDate,
  LOCKED_KEYS,
  memberIsActive,
  ownerMayEdit,
  prefillFrom,
  reviewAllowed,
  type SagunSettingsValues,
} from "./sagun.eligibility.js";
import { SAGUN_CITIES, sagunFields } from "./sagun.fields.js";
import { ageOf, contactKeys, effectiveFields, fileKinds, type ProfileData, pick, publicKeys, sagunUploadMime, sanitizeData } from "./sagun.rules.js";

// Private Sagun storage (photos, documents, generated booklets): never inside the public uploads folder or a web root.
export function sagunPrivateRoot(uploadsDir: string) {
  const root = path.resolve(process.env.SAGUN_PRIVATE_DIR || path.join(path.dirname(uploadsDir), `${path.basename(uploadsDir)}-sagun-private`));
  if (root.split(path.sep).some((part) => ["public_html", "htdocs", "wwwroot"].includes(part))) throw new ApiError(500, "SAGUN_PRIVATE_STORAGE");
  const relative = path.relative(path.resolve(uploadsDir), root);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) throw new ApiError(500, "SAGUN_PRIVATE_STORAGE");
  return root;
}

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
    if (user.status !== "active" || !user.isVerified) throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
    if (user.role === "admin") return;
    if (await this.db.family.findFirst({ where: { ownerUserId: user.id, status: "ACTIVE" }, select: { id: true } })) return;
    if (!user.email) throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
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
  // Application log: every status change and admin correction, kept even after a profile is deleted.
  private log(tx: Db, profileId: string, action: string, previousStatus: string | null, newStatus: string | null, user: UserRow, remarks?: string | null) {
    return tx.sagunApplicationLog.create({
      data: { id: randomId(), sagunProfileId: profileId, action, previousStatus, newStatus, actionBy: user.id, remarks: remarks || null },
    });
  }
  async settings(db: Db = this.db): Promise<SagunSettingsValues> {
    const row = await db.sagunSettings.findUnique({ where: { id: "default" } });
    if (!row) return DEFAULT_SETTINGS;
    return {
      minimumFemaleAge: row.minimumFemaleAge,
      minimumMaleAge: row.minimumMaleAge,
      registrationEnabled: row.registrationEnabled,
      profileVisibility: row.profileVisibility,
      approvalRequired: row.approvalRequired,
      allowEditAfterSubmission: row.allowEditAfterSubmission,
      allowResubmission: row.allowResubmission,
    };
  }
  // The family (display id) the user belongs to: an ACTIVE family registered with their email,
  // else the ACTIVE family of an active member registered with their email.
  private async ownFamilyId(user: UserRow): Promise<string | null> {
    const owned = await this.db.family.findFirst({ where: { ownerUserId: user.id, status: "ACTIVE" }, select: { familyId: true } });
    if (owned?.familyId) return owned.familyId;
    if (!user.email) return null;
    const family = await this.db.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { familyId: true } });
    if (family?.familyId) return family.familyId;
    const member = await this.db.familyMember.findFirst({
      where: { email: user.email, status: { in: ["ACTIVE", "Active", "APPROVED"] }, family: { status: "ACTIVE" } },
      select: { familyId: true },
    });
    return member?.familyId ?? null;
  }
  // A family member the caller may apply for: registered, in an ACTIVE family, and (for non-admins) in the caller's own family.
  // Never trusts ids, ages or genders from the client: everything is read back from the family registration tables.
  private async resolveMember(memberId: string, user: UserRow, db: Db = this.db) {
    const member = await db.familyMember.findUnique({ where: { id: memberId }, include: { family: true } });
    if (member?.family.status !== "ACTIVE") throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
    if (user.role !== "admin") {
      const familyId = await this.ownFamilyId(user);
      if (!familyId || familyId !== member.familyId) throw new ApiError(403, "SAGUN_MEMBER_NOT_IN_FAMILY");
    }
    return member;
  }
  private async linkedStudent(
    member: { linkedStudentId: string | null; familyId: string; membershipId: string | null; name: string; gender: string | null; dob: Date | null },
    db: Db = this.db,
  ) {
    const select = {
      studentId: true,
      studentName: true,
      status: true,
      dob: true,
      gender: true,
      course: true,
      institution: true,
      academicYear: true,
      linkedFamilyId: true,
      linkedMembershipId: true,
    } as const;
    const student = member.linkedStudentId
      ? await db.student.findUnique({ where: { studentId: member.linkedStudentId }, select })
      : member.membershipId
        ? await db.student.findFirst({ where: { linkedFamilyId: member.familyId, linkedMembershipId: member.membershipId, status: "ACTIVE" }, select })
        : null;
    if (!student || student.status !== "ACTIVE") return { student: null, conflicts: [] as string[] };
    const linkConflict =
      (student.linkedFamilyId && student.linkedFamilyId !== member.familyId) ||
      (student.linkedMembershipId && member.membershipId && student.linkedMembershipId !== member.membershipId);
    if (linkConflict) return { student: null, conflicts: ["studentLink"] };
    const conflicts: string[] = [];
    const norm = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() || "";
    if (norm(student.studentName) && norm(member.name) && norm(student.studentName) !== norm(member.name)) conflicts.push("name");
    if (student.dob && member.dob && isoDate(student.dob) !== isoDate(member.dob)) conflicts.push("dob");
    const studentGender = genderOf(student.gender);
    const familyGender = genderOf(member.gender);
    if (studentGender && familyGender && studentGender !== familyGender) conflicts.push("gender");
    return { student, conflicts };
  }
  // Was the latest switch to INACTIVE made by the owner (deactivation / consent withdrawal) rather than an admin?
  private async inactivatedByOwner(profileId: string): Promise<boolean> {
    const last = await this.db.sagunApplicationLog.findFirst({ where: { sagunProfileId: profileId, newStatus: "INACTIVE" }, orderBy: { createdAt: "desc" } });
    return !last || ["OWNER_DEACTIVATED", "CONSENT_WITHDRAWN"].includes(last.action);
  }
  private columns(data: ProfileData) {
    return {
      displayName: String(data.fullName || "").slice(0, 150),
      candidateType: String(data.candidateType || ""),
      birthDate: data.dob ? new Date(`${data.dob}T00:00:00Z`) : null,
      // The searchable city: the chosen city, or the district for a Khargone-area village.
      city: SAGUN_CITIES.includes(String(data.nativeVillage)) ? String(data.nativeVillage) : String(data.district || ""),
      gotra: String(data.gotra || ""),
      education: String(data.education || ""),
      occupation: String(data.occupation || ""),
      maritalStatus: String(data.maritalStatus || ""),
    };
  }
  private birthRange(minAge?: number, maxAge?: number) {
    const date = new Date(`${indiaToday()}T00:00:00Z`);
    const oldest = new Date(date);
    oldest.setUTCFullYear(oldest.getUTCFullYear() - (maxAge || 120) - 1);
    const newest = new Date(date);
    newest.setUTCFullYear(newest.getUTCFullYear() - (minAge || 18));
    return { gt: oldest, lte: newest };
  }
  async schema() {
    const config = await this.db.sagunConfig.findUnique({ where: { id: "fields" } });
    return {
      fields: effectiveFields(config?.fields).map((field) => ({
        ...field,
        exposure: publicKeys.includes(field.key) ? "MEMBERS" : contactKeys.includes(field.key) ? "CONTACT" : field.section === "sagun" ? "SAGUN" : "OWNER",
      })),
      maxFileBytes: 10 * 1024 * 1024,
      settings: await this.settings().then(({ minimumFemaleAge, minimumMaleAge, registrationEnabled, profileVisibility }) => ({
        minimumFemaleAge,
        minimumMaleAge,
        registrationEnabled,
        directoryEnabled: profileVisibility === "MEMBERS",
      })),
      sections: ["personal", "education", "family", "preferences", "documents", "privacy"],
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
      if ((field.section === "sagun" || (field.section === "documents" && !field.required)) && value.required) throw new ApiError(400, "SAGUN_OPTIONAL");
      overrides.push({ key, ...value });
    }
    await this.tx(async (tx) => {
      await tx.sagunConfig.upsert({ where: { id: "fields" }, create: { id: "fields", fields: overrides }, update: { fields: overrides } });
      await this.audit(tx, user, "CONFIGURE_FIELDS", "fields");
    });
    return this.schema();
  }
  private published(profile: SagunProfile, settings: SagunSettingsValues) {
    const data = profile.data as ProfileData;
    return (
      settings.profileVisibility === "MEMBERS" &&
      profile.memberId !== null &&
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
    const settings = await this.settings();
    const [profiles, incoming, outgoing, notices] = await Promise.all([
      this.db.sagunProfile.findMany({
        where: { userId: user.id },
        include: { files: { select: { id: true, kind: true, mime: true, size: true } }, member: { select: { membershipId: true, name: true } } },
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
        profileName: this.published(row.profile, settings) ? row.profile.displayName : "",
        status: row.status,
        shareSagun: row.shareSagun,
      })),
      notices,
    };
  }
  async save(id: string | undefined, input: SagunSaveDto, user: UserRow | null) {
    if (!user) throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
    await this.member(user);
    const settings = await this.settings();
    const isAdmin = user.role === "admin";
    const submit = input.action === "SUBMIT";
    let owner = user;
    if (!id && input.ownerUserId && input.ownerUserId !== user.id) {
      this.admin(user);
      const found = await this.db.user.findUnique({ where: { id: input.ownerUserId } });
      if (!found) throw new ApiError(404, "SAGUN_NOT_FOUND");
      await this.member(found);
      owner = found;
    }
    const existing = id ? await this.owned(id, user) : null;
    if (!isAdmin && (!existing || submit) && !settings.registrationEnabled) throw new ApiError(403, "SAGUN_REGISTRATION_CLOSED");
    if (existing && !isAdmin && !ownerMayEdit(existing.status, settings, existing.status !== "INACTIVE" || (await this.inactivatedByOwner(existing.id))))
      throw new ApiError(409, "SAGUN_EDIT_LOCKED");
    if (existing?.memberId && input.memberId && input.memberId !== existing.memberId) throw new ApiError(400, "SAGUN_MEMBER_CHANGE");
    const memberId = existing?.memberId ?? input.memberId;
    // A new application, and every submission, must name a registered family member.
    if (!memberId && (!existing || submit)) throw new ApiError(400, "SAGUN_MEMBER_ID");
    const member = memberId ? await this.resolveMember(memberId, user) : null;
    const eligibility = member ? evaluateMember(member, settings) : null;
    if (input.category && eligibility?.gender && candidateTypeOf(eligibility.gender) !== input.category) throw new ApiError(400, "SAGUN_CATEGORY");
    if (eligibility && !eligibility.eligible && eligibility.reason && (submit || !existing)) throw eligibilityError(eligibility.reason);
    const studentLink = member ? await this.linkedStudent(member) : null;
    if (member && member.id !== existing?.memberId) {
      const other = await this.db.sagunProfile.findUnique({ where: { memberId: member.id }, select: { id: true } });
      if (other && other.id !== existing?.id) throw new ApiError(409, "SAGUN_DUPLICATE");
    }
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
    // Birth date and gender come from the family registration, whatever the form sent.
    if (member && eligibility?.gender) raw.candidateType = candidateTypeOf(eligibility.gender);
    if (member?.dob) raw.dob = isoDate(member.dob);
    const data = sanitizeData(raw, fields, submit);
    const old = (existing?.data || {}) as ProfileData;
    const actualOwner = existing?.userId || owner.id;
    if (
      actualOwner !== user.id &&
      [
        "candidateConsent",
        "displayConsent",
        "shareContact",
        "bookletContactConsent",
        "termsConsent",
        "matrimonialConsent",
        "accuracyConsent",
        "voluntaryConsent",
      ].some((key) => data[key] === true && old[key] !== true)
    )
      throw new ApiError(400, "SAGUN_OWNER_CONSENT");
    const status = submit ? (settings.approvalRequired ? "SUBMITTED" : "APPROVED") : "DRAFT";
    const now = new Date();
    let saved: SagunProfile;
    try {
      saved = await this.tx(async (tx) => {
        if (!existing && (await tx.sagunProfile.count({ where: { userId: owner.id } })) >= 10) throw new ApiError(429, "SAGUN_LIMIT");
        const values = {
          ...this.columns(data),
          data: data as Prisma.InputJsonObject,
          visibility: String(data.visibility || "PRIVATE"),
          status,
          reviewNotes: null,
          ...(member
            ? {
                memberId: member.id,
                familyId: member.familyId,
                studentId: studentLink?.student?.studentId ?? existing?.studentId ?? null,
                village: String(member.family.village || member.family.nativePlace || "").slice(0, 255),
              }
            : {}),
          ...(submit ? { submittedAt: now, ageAtSubmission: eligibility?.age ?? null } : {}),
          approvedAt: status === "APPROVED" ? now : null,
        };
        const row = existing
          ? await tx.sagunProfile.update({ where: { id: existing.id }, data: values })
          : await tx.sagunProfile.create({
              data: { ...values, id: randomId(), reference: `SAGUN-${randomId().replaceAll("-", "").slice(0, 12).toUpperCase()}`, userId: owner.id },
            });
        if (
          existing &&
          ["candidateConsent", "displayConsent", "shareContact", "bookletContactConsent", "termsConsent", "matrimonialConsent", "accuracyConsent"].some(
            (key) => old[key] !== data[key],
          )
        )
          await this.audit(tx, user, "CONSENT_CHANGED", row.id);
        if (existing && sagunFields.some((field) => field.section === "sagun" && JSON.stringify(old[field.key]) !== JSON.stringify(data[field.key])))
          await this.audit(tx, user, "SAGUN_DETAILS_CHANGED", row.id);
        if (submit && studentLink?.conflicts.length)
          await this.log(
            tx,
            row.id,
            "SOURCE_DATA_CONFLICT",
            existing?.status ?? "DRAFT",
            status,
            user,
            `Student record differs from family record: ${studentLink.conflicts.join(", ")}`,
          );
        await this.audit(tx, user, submit ? "SUBMIT_PROFILE" : "SAVE_DRAFT", row.id);
        if (!existing || existing.status !== status || submit)
          await this.log(
            tx,
            row.id,
            submit ? "SUBMITTED" : existing ? "REOPENED_AS_DRAFT" : "CREATED",
            existing?.status ?? null,
            submit ? "SUBMITTED" : status,
            user,
          );
        if (status === "APPROVED") await this.log(tx, row.id, "AUTO_APPROVED", "SUBMITTED", "APPROVED", user, "Approval not required by settings");
        if (submit) await this.notice(tx, row.userId, "PROFILE_SUBMITTED", row.id);
        return row;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ApiError(409, "SAGUN_DUPLICATE");
      throw error;
    }
    // A submitted profile appears in Admin → Sagun Digital Cards. Done after the commit so a card problem never blocks
    // the member's submission; the admin list creates any card that is still missing.
    if (submit)
      await ensureDigitalCard(this.db, saved.id).catch((error: unknown) =>
        console.error(JSON.stringify({ event: "sagun_card_create_failed", profileId: saved.id, error: String(error) })),
      );
    return saved;
  }
  async review(id: string, input: SagunReviewDto, user: UserRow) {
    this.admin(user);
    await this.member(user);
    const notes = input.notes?.trim() || null;
    if (input.status === "REJECTED" && !notes) throw new ApiError(400, "SAGUN_REMARKS_REQUIRED");
    const settings = await this.settings();
    const fields = (await this.schema()).fields;
    await this.tx(async (tx) => {
      const profile = await tx.sagunProfile.findUnique({ where: { id }, include: { files: true } });
      if (!profile) throw new ApiError(404, "SAGUN_NOT_FOUND");
      if (!reviewAllowed(profile.status, input.status)) throw new ApiError(409, "SAGUN_STATE");
      if (input.status === "APPROVED") {
        if (!profile.memberId) throw new ApiError(400, "SAGUN_MEMBER_ID");
        // Re-check against the family registration at approval time: the member may have left the family or been deactivated.
        const member = await this.resolveMember(profile.memberId, user, tx);
        const eligibility = evaluateMember(member, settings);
        if (!eligibility.eligible && eligibility.reason) throw eligibilityError(eligibility.reason);
        const data = profile.data as ProfileData;
        sanitizeData(data, fields, true);
        if (!profile.files.some((file) => file.kind === "PHOTO" && file.id === data.photoFileId)) throw new ApiError(400, "SAGUN_FIELD:photoFileId");
      }
      await tx.sagunProfile.update({
        where: { id },
        data: {
          status: input.status,
          reviewNotes: notes,
          approvedAt: input.status === "APPROVED" ? new Date() : input.status === "UNDER_REVIEW" ? null : profile.approvedAt,
        },
      });
      await this.audit(tx, user, `REVIEW_${input.status}`, id);
      await this.log(tx, id, `REVIEW_${input.status}`, profile.status, input.status, user, notes);
      await this.notice(tx, profile.userId, "PROFILE_REVIEWED", id);
    });
    return { ok: true };
  }
  async deactivate(id: string, user: UserRow) {
    const profile = await this.owned(id, user);
    if (profile.status === "INACTIVE") return { ok: true };
    await this.tx(async (tx) => {
      await tx.sagunProfile.update({ where: { id }, data: { status: "INACTIVE" } });
      await this.audit(tx, user, "DEACTIVATE", profile.id);
      await this.log(tx, profile.id, profile.userId === user.id ? "OWNER_DEACTIVATED" : "ADMIN_DEACTIVATED", profile.status, "INACTIVE", user);
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
      await tx.sagunProfile.update({ where: { id }, data: { data: data as Prisma.InputJsonObject, visibility: "PRIVATE", status: "INACTIVE" } });
      await this.log(tx, id, "CONSENT_WITHDRAWN", profile.status, "INACTIVE", user);
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
      await this.log(tx, id, "DELETED", profile.status, null, user);
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
    const settings = await this.settings();
    if (settings.profileVisibility !== "MEMBERS") return { records: [], hasMore: false, directoryEnabled: false };
    const where: Prisma.SagunProfileWhereInput = {
      status: "APPROVED",
      visibility: "MEMBERS",
      memberId: { not: null },
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
    if (query.minAge || query.maxAge) where.birthDate = this.birthRange(query.minAge, query.maxAge);
    const rows = await this.db.sagunProfile.findMany({
      where,
      include: { files: { where: { kind: "PHOTO" }, select: { id: true, kind: true } } },
      orderBy: { updatedAt: "desc" },
      skip: query.offset || 0,
      take: 13,
    });
    const records = rows
      .slice(0, 12)
      .filter((row) => this.published(row, settings))
      .map((row) => this.summary(row));
    return { records, hasMore: rows.length > 12, directoryEnabled: true };
  }
  async detail(id: string, user: UserRow) {
    await this.member(user);
    const profile = await this.db.sagunProfile.findUnique({
      where: { id },
      include: { files: { select: { id: true, kind: true, mime: true, size: true } }, user: { select: { status: true } } },
    });
    if (!profile) throw new ApiError(404, "SAGUN_NOT_FOUND");
    if (profile.userId === user.id || user.role === "admin") return profile;
    if (!this.published(profile, await this.settings()) || profile.user.status !== "active") throw new ApiError(404, "SAGUN_NOT_FOUND");
    const inquiry = await this.db.sagunInquiry.findUnique({ where: { profileId_userId: { profileId: id, userId: user.id } } });
    const data = profile.data as ProfileData;
    const contact = inquiry?.status === "ACCEPTED" && data.shareContact === true ? pick(data, contactKeys) : null;
    if (contact) await this.audit(this.db, user, "VIEW_SHARED_CONTACT", id);
    return { ...this.summary(profile), data: pick(data, publicKeys), contact, inquiryStatus: inquiry?.status || null };
  }
  async inquiry(id: string, input: SagunInquiryDto, user: UserRow) {
    await this.member(user);
    if (!input.consent || !input.message.trim()) throw new ApiError(400, "SAGUN_CONSENT");
    const profile = await this.db.sagunProfile.findUnique({ where: { id }, include: { user: { select: { status: true } } } });
    if (!profile || !this.published(profile, await this.settings()) || profile.user.status !== "active" || profile.userId === user.id)
      throw new ApiError(404, "SAGUN_NOT_FOUND");
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
    const settings = await this.settings();
    await this.tx(async (tx) => {
      const row = await tx.sagunInquiry.findUnique({ where: { id }, include: { profile: true, user: true } });
      if (!row) throw new ApiError(404, "SAGUN_NOT_FOUND");
      if (input.action === "WITHDRAW") {
        if (row.userId !== user.id || !["PENDING", "ACCEPTED"].includes(row.status)) throw new ApiError(404, "SAGUN_NOT_FOUND");
        await tx.sagunInquiry.update({ where: { id }, data: { status: "WITHDRAWN", shareSagun: false } });
      } else {
        if (row.profile.userId !== user.id) throw new ApiError(403, "SAGUN_OWNER_REQUIRED");
        if (input.action === "ACCEPT" && (row.status !== "PENDING" || !this.published(row.profile, settings) || row.user.status !== "active"))
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
  // Members of the caller's registered family, with eligibility worked out from the family record.
  async eligibleMembers(user: UserRow) {
    await this.member(user);
    const settings = await this.settings();
    const familyId = await this.ownFamilyId(user);
    if (!familyId) {
      if (user.role === "admin") return { family: null, members: [], registrationEnabled: settings.registrationEnabled };
      throw new ApiError(403, "SAGUN_MEMBER_REQUIRED");
    }
    const family = await this.db.family.findUnique({ where: { familyId }, select: { familyId: true, familyName: true, headName: true, village: true } });
    const members = await this.db.familyMember.findMany({
      where: { familyId },
      include: { sagunProfile: { select: { id: true, status: true, reference: true, userId: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return {
      family,
      registrationEnabled: settings.registrationEnabled,
      minimumFemaleAge: Math.max(18, settings.minimumFemaleAge),
      minimumMaleAge: Math.max(21, settings.minimumMaleAge),
      members: members.map((member) => {
        const eligibility = evaluateMember(member, settings);
        const application = member.sagunProfile
          ? {
              id: member.sagunProfile.id,
              status: member.sagunProfile.status,
              reference: member.sagunProfile.reference,
              mine: member.sagunProfile.userId === user.id,
            }
          : null;
        return {
          id: member.id,
          membershipId: member.membershipId,
          name: member.name,
          relationship: member.relationship,
          gender: eligibility.gender,
          age: eligibility.age,
          minimumAge: eligibility.minimumAge,
          eligible: eligibility.eligible && !application && settings.registrationEnabled,
          reason: application ? "ALREADY_APPLIED" : eligibility.reason,
          application,
        };
      }),
    };
  }
  // One member's family-registration data mapped onto the Sagun form, after the same checks as submission.
  async memberPrefill(memberId: string, user: UserRow) {
    await this.member(user);
    const settings = await this.settings();
    const member = await this.resolveMember(memberId, user);
    const eligibility = evaluateMember(member, settings);
    const [relatives, existing, studentLink] = await Promise.all([
      this.db.familyMember.findMany({ where: { familyId: member.familyId }, select: { id: true, name: true, relationship: true, gender: true, mobile: true } }),
      this.db.sagunProfile.findUnique({ where: { memberId: member.id }, select: { id: true, status: true, reference: true } }),
      this.linkedStudent(member),
    ]);
    const prefill = prefillFrom(member, member.family, relatives);
    if (studentLink.student?.course) prefill.education = studentLink.student.course;
    if (studentLink.student?.institution) prefill.college = studentLink.student.institution;
    if (studentLink.student?.academicYear) prefill.professionalDetails = studentLink.student.academicYear;
    return {
      member: {
        id: member.id,
        membershipId: member.membershipId,
        familyId: member.familyId,
        name: member.name,
        gender: eligibility.gender,
        dob: isoDate(member.dob),
        age: eligibility.age,
        mobile: member.mobile,
        village: member.family.village || member.family.nativePlace,
        address: member.address || member.family.address,
        active: memberIsActive(member.status),
      },
      eligibility: {
        ...eligibility,
        eligible: eligibility.eligible && !existing && settings.registrationEnabled,
        reason: existing ? "ALREADY_APPLIED" : eligibility.reason,
      },
      existing,
      student: studentLink.student
        ? {
            studentId: studentLink.student.studentId,
            course: studentLink.student.course,
            institution: studentLink.student.institution,
            academicYear: studentLink.student.academicYear,
          }
        : null,
      sourceConflicts: studentLink.conflicts,
      lockedKeys: LOCKED_KEYS,
      prefill,
    };
  }
  async stats(user: UserRow) {
    this.admin(user);
    const [byStatus, byType] = await Promise.all([
      this.db.sagunProfile.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.sagunProfile.groupBy({ by: ["candidateType"], where: { status: { not: "DRAFT" } }, _count: { _all: true } }),
    ]);
    const status = (name: string) => byStatus.find((row) => row.status === name)?._count._all ?? 0;
    const type = (name: string) => byType.find((row) => row.candidateType === name)?._count._all ?? 0;
    return {
      total: byStatus.reduce((sum, row) => sum + (row.status === "DRAFT" ? 0 : row._count._all), 0),
      drafts: status("DRAFT"),
      pending: status("SUBMITTED") + status("UNDER_REVIEW"),
      submitted: status("SUBMITTED"),
      underReview: status("UNDER_REVIEW"),
      approved: status("APPROVED"),
      rejected: status("REJECTED"),
      inactive: status("INACTIVE"),
      male: type("GROOM"),
      female: type("BRIDE"),
    };
  }
  async adminList(query: SagunAdminListDto, user: UserRow) {
    this.admin(user);
    if (query.minAge && query.maxAge && query.minAge > query.maxAge) throw new ApiError(400, "SAGUN_AGE_RANGE");
    const search = query.search?.trim();
    const where: Prisma.SagunProfileWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.candidateType ? { candidateType: query.candidateType } : {}),
      ...(query.village ? { village: { contains: query.village } } : {}),
      ...(query.education ? { education: { contains: query.education } } : {}),
      ...(query.occupation ? { occupation: { contains: query.occupation } } : {}),
      ...(query.minAge || query.maxAge ? { birthDate: this.birthRange(query.minAge, query.maxAge) } : {}),
    };
    if (search) {
      const [identifierMatches, nameMatches] = await Promise.all([
        this.db.sagunProfile.findMany({
          where: { OR: [{ familyId: search }, { reference: search }, { member: { membershipId: search } }, { studentId: search }] },
          select: { id: true },
        }),
        this.db.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM sagun_profiles WHERE LOCATE(${search} COLLATE utf8mb4_unicode_ci, display_name COLLATE utf8mb4_unicode_ci) > 0`,
      ]);
      where.id = { in: [...new Set([...identifierMatches.map((row) => row.id), ...nameMatches.map((row) => row.id)])] };
    }
    const [total, rows] = await Promise.all([
      this.db.sagunProfile.count({ where }),
      this.db.sagunProfile.findMany({
        where,
        include: { files: { select: { id: true, kind: true, mime: true, size: true } }, member: { select: { membershipId: true } } },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: query.offset || 0,
        take: query.limit || 100,
      }),
    ]);
    return {
      total,
      records: rows.map((row) => ({
        ...row,
        membershipId: row.member?.membershipId ?? null,
        age: row.birthDate ? ageOf(isoDate(row.birthDate) as string) : null,
        member: undefined,
      })),
    };
  }
  // Admin correction of an application. Identity (birth date, gender), consents and files can't be changed here.
  async adminEdit(id: string, input: SagunAdminEditDto, user: UserRow) {
    this.admin(user);
    const protectedKeys = new Set<string>([
      ...LOCKED_KEYS,
      ...Object.values(fileKinds),
      ...sagunFields.filter((field) => field.section === "privacy" || field.key === "voluntaryConsent").map((field) => field.key),
    ]);
    const keys = Object.keys(input.data);
    if (!keys.length || keys.some((key) => protectedKeys.has(key))) throw new ApiError(400, "SAGUN_ADMIN_EDIT_FIELD");
    const fields = (await this.schema()).fields;
    return this.tx(async (tx) => {
      const profile = await tx.sagunProfile.findUnique({ where: { id } });
      if (!profile) throw new ApiError(404, "SAGUN_NOT_FOUND");
      const old = profile.data as ProfileData;
      const data = sanitizeData({ ...old, ...input.data }, fields, ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(profile.status));
      const changed = keys.filter((key) => JSON.stringify(old[key]) !== JSON.stringify(data[key]));
      if (!changed.length) return profile;
      const row = await tx.sagunProfile.update({ where: { id }, data: { ...this.columns(data), data: data as Prisma.InputJsonObject } });
      await this.audit(tx, user, "ADMIN_EDIT", id);
      await this.log(tx, id, "ADMIN_EDIT", profile.status, profile.status, user, `${input.remarks} [${changed.join(", ")}]`.slice(0, 2000));
      await this.notice(tx, profile.userId, "PROFILE_CORRECTED", id);
      return row;
    });
  }
  async applicationLogs(id: string, user: UserRow) {
    this.admin(user);
    return this.db.sagunApplicationLog.findMany({ where: { sagunProfileId: id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 500 });
  }
  async adminSettings(user: UserRow) {
    this.admin(user);
    return this.settings();
  }
  async updateSettings(input: SagunSettingsDto, user: UserRow) {
    this.admin(user);
    const values = {
      minimumFemaleAge: input.minimumFemaleAge,
      minimumMaleAge: input.minimumMaleAge,
      registrationEnabled: input.registrationEnabled,
      profileVisibility: input.profileVisibility,
      approvalRequired: input.approvalRequired,
      allowEditAfterSubmission: input.allowEditAfterSubmission,
      allowResubmission: input.allowResubmission,
    };
    await this.tx(async (tx) => {
      await tx.sagunSettings.upsert({ where: { id: "default" }, create: { id: "default", ...values }, update: values });
      await this.audit(tx, user, "CONFIGURE_SETTINGS", "default");
    });
    return this.settings();
  }
  private privateDir() {
    return sagunPrivateRoot(this.config.uploadsDir);
  }
  // Changing a file sends a submitted/approved profile back to DRAFT, so it needs the same permission as editing.
  private async assertEditable(profile: SagunProfile, user: UserRow) {
    if (user.role === "admin") return;
    const settings = await this.settings();
    if (!ownerMayEdit(profile.status, settings, profile.status !== "INACTIVE" || (await this.inactivatedByOwner(profile.id))))
      throw new ApiError(409, "SAGUN_EDIT_LOCKED");
  }
  async upload(id: string, kind: string, file: Express.Multer.File | undefined, consent: string, user: UserRow) {
    await this.assertEditable(await this.owned(id, user), user);
    if (!file || !fileKinds[kind] || consent !== "true") throw new ApiError(400, "SAGUN_UPLOAD_CONSENT");
    if (!file.size || file.size > 10 * 1024 * 1024) throw new ApiError(400, "SAGUN_FILE_SIZE");
    const mime = sagunUploadMime(file.buffer, kind, file.mimetype, file.originalname);
    if (!mime) throw new ApiError(400, "SAGUN_FILE_TYPE");
    const root = this.privateDir();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const filename = `${randomId()}.${mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "pdf"}`;
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
        if (current.status !== "DRAFT") await this.log(tx, id, "REOPENED_AS_DRAFT", current.status, "DRAFT", user, `File changed: ${kind}`);
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
    await this.assertEditable(file.profile, user);
    await this.tx(async (tx) => {
      await tx.sagunFile.delete({ where: { id } });
      const latest = await tx.sagunProfile.findUniqueOrThrow({ where: { id: file.profileId } });
      const data = { ...(latest.data as ProfileData) };
      delete data[fileKinds[file.kind]];
      await tx.sagunProfile.update({ where: { id: file.profileId }, data: { data: data as Prisma.InputJsonObject, status: "DRAFT" } });
      await this.audit(tx, user, `DELETE_${file.kind}`, file.profileId);
      if (latest.status !== "DRAFT") await this.log(tx, file.profileId, "REOPENED_AS_DRAFT", latest.status, "DRAFT", user, `File removed: ${file.kind}`);
    });
    await unlink(path.join(this.privateDir(), file.filename)).catch(() => undefined);
    return { ok: true };
  }
  async file(id: string, user: UserRow) {
    await this.member(user);
    const file = await this.db.sagunFile.findUnique({ where: { id }, include: { profile: { include: { user: { select: { status: true } } } } } });
    if (!file) throw new ApiError(404, "SAGUN_NOT_FOUND");
    const own = file.profile.userId === user.id || user.role === "admin";
    if (!own && (file.kind !== "PHOTO" || !this.published(file.profile, await this.settings()) || file.profile.user.status !== "active"))
      throw new ApiError(404, "SAGUN_NOT_FOUND");
    if (file.kind !== "PHOTO") await this.audit(this.db, user, "READ_PRIVATE_DOCUMENT", file.profileId);
    try {
      return { buffer: await readFile(path.join(this.privateDir(), file.filename)), mime: file.mime, filename: file.filename };
    } catch {
      throw new ApiError(404, "SAGUN_NOT_FOUND");
    }
  }
}
