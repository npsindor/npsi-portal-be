import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiError } from "../../common/filters/api-error.js";
import { adminNewApplicationEmail, memberWelcomeEmail } from "../../common/mail/email-templates.js";
import { MailService } from "../../common/mail/mail.service.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../../common/recaptcha/recaptcha.service.js";
import { SessionService, type UserRow } from "../../common/session/session.service.js";
import { randomId } from "../../common/utils/crypto.js";
import {
  allowedFields,
  buildWhere,
  findMarkupField,
  normalizeMobile,
  quoteIdentifier,
  type RecordBody,
  sanitizeDateValues,
  toColumn,
  toMoneyNumber,
  valueForSql,
} from "../../common/utils/records.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { AvailabilityService } from "../lookups/availability.service.js";
import { acceptedFields, type EntityBody, type ListQueryDto } from "./dto/entity.dto.js";
import { EntitiesRepository } from "./entities.repository.js";
import { ENTITY_DEFINITIONS, type EntityName } from "./entity-definitions.js";
import {
  AUTH_CREATE_ENTITIES,
  AUTH_READ_ENTITIES,
  ID_FIELD_CONFIG,
  NON_ADMIN_WRITABLE_FIELDS,
  OWNERSHIP_ENTITIES,
  PUBLIC_CREATE_ENTITIES,
  PUBLIC_READ_ENTITIES,
} from "./entity-rules.js";
import { type EntityVo, toEntityVo } from "./vo/entity.vo.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blank = (value: unknown): boolean => !value || !String(value).trim();

export interface BatchResult {
  status: 200 | 201;
  records: EntityVo[];
}

// Business rules of the generic entity API (list/create/batch/update/delete),
// ported unchanged from the legacy router: who may do what, ownership checks,
// non-admin field whitelists, server-assigned ids and form validation.
@Injectable()
export class EntitiesService {
  constructor(
    private readonly repo: EntitiesRepository,
    private readonly sessions: SessionService,
    private readonly availability: AvailabilityService,
    private readonly recaptcha: RecaptchaService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async list(entity: EntityName, query: ListQueryDto, request: Request): Promise<EntityVo[]> {
    const { table } = ENTITY_DEFINITIONS[entity];
    let requestingUser: UserRow | null = null;
    if (!PUBLIC_READ_ENTITIES.has(entity)) {
      requestingUser = AUTH_READ_ENTITIES.has(entity) ? await this.sessions.requireUser(request) : await this.sessions.requireAdmin(request);
    }
    const filter = query.filter ? (JSON.parse(query.filter) as RecordBody) : {};
    const values: unknown[] = [];
    let where = buildWhere(filter, values);
    if (entity === "Notification" && requestingUser?.role !== "admin") {
      // Members see only their own family's notifications plus broadcasts.
      const ownFamilyId = await this.repo.ownFamilyId(requestingUser);
      const clause = `(${quoteIdentifier("recipient_family_id")} = ? OR ${quoteIdentifier("recipient_family_id")} IS NULL)`;
      values.push(ownFamilyId || "__none__");
      where = where ? `${where} AND ${clause}` : ` WHERE ${clause}`;
    }
    const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
    const order = query.order || "-createdAt";
    const descending = order.startsWith("-");
    values.push(limit);
    const rows = await this.repo.list(table, where, values, toColumn(descending ? order.slice(1) : order), descending);
    return rows.map(toEntityVo);
  }

  async create(entity: EntityName, body: EntityBody | undefined, request: Request): Promise<EntityVo> {
    const { table } = ENTITY_DEFINITIONS[entity];
    let actingUser: UserRow | null = null;
    if (PUBLIC_CREATE_ENTITIES.has(entity)) {
      // No auth: public registration / payment-intent flows.
    } else if (OWNERSHIP_ENTITIES.has(entity)) {
      actingUser = await this.sessions.requireUser(request);
      if (actingUser.role !== "admin") {
        if (entity === "Family") throw new ApiError(403, "Admin access required.");
        const ownFamilyId = await this.repo.ownFamilyId(actingUser);
        if (!ownFamilyId || body?.family_id !== ownFamilyId) throw new ApiError(403, "You can only add members to your own family.");
      }
    } else if (AUTH_CREATE_ENTITIES.has(entity)) {
      actingUser = await this.sessions.requireUser(request);
    } else {
      actingUser = await this.sessions.requireAdmin(request);
    }
    // Public-create entities are anonymous by design, so the non-admin field
    // whitelist (meant for members writing their own records) doesn't apply.
    const sanitizedBody = PUBLIC_CREATE_ENTITIES.has(entity)
      ? (sanitizeDateValues(body || {}) as RecordBody)
      : this.restrictNonAdminFields(entity, actingUser, sanitizeDateValues(body || {}) as RecordBody, true);
    const record: RecordBody = { id: randomId(), ...sanitizedBody };
    if (actingUser?.role !== "admin") {
      const badField = findMarkupField(record);
      if (badField) throw new ApiError(400, `The "${badField}" field cannot contain < or > characters.`);
    }
    if (entity === "EventRegistration" && actingUser?.role !== "admin") await this.applyEventRegistrationRules(record, actingUser as UserRow);
    if (entity === "TransferRequest" && actingUser?.role !== "admin") await this.applyTransferRequestRules(record, actingUser as UserRow);
    if (entity === "Application" || entity === "StudentApplication") {
      // Public forms carry a reCAPTCHA token; it is never a real column.
      const token = record.recaptchaToken;
      delete record.recaptchaToken;
      if (!(await this.recaptcha.verify(token))) throw new ApiError(400, RECAPTCHA_FAILED);
    }
    const idConfig = ID_FIELD_CONFIG[entity];
    if (idConfig) record[idConfig.field] = await this.repo.nextSequentialId(table, toColumn(idConfig.field), idConfig.prefix());
    const fields = allowedFields(record);
    if (entity === "Application") await this.validateApplication(record);
    if (entity === "StudentApplication") await this.validateStudentApplication(record);
    await this.repo.insert(table, ["id", ...fields.map(toColumn)], [record.id, ...fields.map((field) => valueForSql(record[field]))]);
    const created = toEntityVo(await this.findOrFail(table, record.id as string));
    if (entity === "Application")
      this.sendApplicationEmails(created).catch((error: unknown) =>
        console.error("[mailer] application email failed:", error instanceof Error ? error.message : error),
      );
    return created;
  }

  async createBatch(entity: EntityName, body: { records?: unknown } | undefined, request: Request): Promise<BatchResult> {
    const { table } = ENTITY_DEFINITIONS[entity];
    await this.sessions.requireAdmin(request);
    const records = Array.isArray(body?.records) ? (body.records as unknown[]) : [];
    if (!records.length) return { status: 200, records: [] };
    const idConfig = ID_FIELD_CONFIG[entity];
    let nextNum = 0;
    let prefix = "";
    if (idConfig) {
      prefix = idConfig.prefix();
      nextNum = parseInt((await this.repo.nextSequentialId(table, toColumn(idConfig.field), prefix)).slice(prefix.length), 10);
    }
    const accepted = acceptedFields(entity);
    const created: EntityVo[] = [];
    for (const item of records) {
      // Same whitelist the single-record DTO applies.
      const known = Object.fromEntries(Object.entries((item || {}) as RecordBody).filter(([field]) => accepted.has(field)));
      const record: RecordBody = { id: randomId(), ...(sanitizeDateValues(known) as RecordBody) };
      if (idConfig) {
        record[idConfig.field] = `${prefix}${String(nextNum).padStart(6, "0")}`;
        nextNum += 1;
      }
      const fields = allowedFields(record);
      await this.repo.insert(table, ["id", ...fields.map(toColumn)], [record.id, ...fields.map((field) => valueForSql(record[field]))]);
      created.push(toEntityVo(await this.findOrFail(table, record.id as string)));
    }
    return { status: 201, records: created };
  }

  async update(entity: EntityName, id: string, body: EntityBody | undefined, request: Request): Promise<EntityVo> {
    const { table } = ENTITY_DEFINITIONS[entity];
    let actingUser: UserRow;
    if (OWNERSHIP_ENTITIES.has(entity)) {
      actingUser = await this.sessions.requireUser(request);
      if (actingUser.role !== "admin") {
        const ownFamilyId = await this.repo.ownFamilyId(actingUser);
        if (!ownFamilyId) throw new ApiError(403, "No family found for your account.");
        if (entity === "Family") {
          const family = await this.repo.familyIdOfFamilyRow(id);
          if (!family || family.family_id !== ownFamilyId) throw new ApiError(403, "You can only update your own family.");
        } else {
          const member = await this.repo.familyIdOfMemberRow(id);
          if (!member || member.family_id !== ownFamilyId) throw new ApiError(403, "You can only update members of your own family.");
        }
      }
    } else if (AUTH_READ_ENTITIES.has(entity)) {
      actingUser = await this.sessions.requireUser(request);
      if (entity === "Notification" && actingUser.role !== "admin") {
        const notification = await this.repo.notificationRecipient(id);
        const ownFamilyId = await this.repo.ownFamilyId(actingUser);
        if (!notification || (notification.recipient_family_id && notification.recipient_family_id !== ownFamilyId)) {
          throw new ApiError(403, "You can only update your own notifications.");
        }
      }
    } else {
      actingUser = await this.sessions.requireAdmin(request);
    }
    const sanitizedBody = this.restrictNonAdminFields(entity, actingUser, sanitizeDateValues(body || {}) as RecordBody, false);
    if (actingUser.role !== "admin") {
      const badField = findMarkupField(sanitizedBody);
      if (badField) throw new ApiError(400, `The "${badField}" field cannot contain < or > characters.`);
    }
    const fields = allowedFields(sanitizedBody);
    if (fields.length)
      await this.repo.update(
        table,
        fields.map(toColumn),
        fields.map((field) => valueForSql(sanitizedBody[field])),
        id,
      );
    const record = await this.repo.findById(table, id);
    if (!record) throw new ApiError(404, "Record not found");
    return toEntityVo(record);
  }

  async remove(entity: EntityName, id: string, request: Request): Promise<void> {
    const { table } = ENTITY_DEFINITIONS[entity];
    if (entity === "FamilyMember") {
      const actingUser = await this.sessions.requireUser(request);
      if (actingUser.role !== "admin") {
        const ownFamilyId = await this.repo.ownFamilyId(actingUser);
        const member = await this.repo.familyIdOfMemberRow(id);
        if (!ownFamilyId || !member || member.family_id !== ownFamilyId) throw new ApiError(403, "You can only remove members of your own family.");
      }
    } else {
      await this.sessions.requireAdmin(request);
    }
    await this.repo.delete(table, id);
  }

  // Non-admins may only write the fields their UI exposes (family_id too on create).
  private restrictNonAdminFields(entity: EntityName, actingUser: UserRow | null, body: RecordBody, allowFamilyId: boolean): RecordBody {
    const allowed = NON_ADMIN_WRITABLE_FIELDS[entity];
    if (!allowed || actingUser?.role === "admin") return body;
    return Object.fromEntries(Object.entries(body).filter(([field]) => allowed.has(field) || (allowFamilyId && field === "family_id")));
  }

  // Fees are computed server-side (no payment gateway; admins reconcile), and
  // members may only register their own family's members.
  private async applyEventRegistrationRules(record: RecordBody, user: UserRow): Promise<void> {
    const ownFamilyId = await this.repo.ownFamilyId(user);
    if (!ownFamilyId || record.family_id !== ownFamilyId) throw new ApiError(403, "You can only register your own family for events.");
    const memberIds = Array.isArray(record.member_ids) ? (record.member_ids as unknown[]) : [];
    if (memberIds.length) {
      const own = new Set((await this.repo.memberIdsOfFamily(ownFamilyId)).map((m) => m.id));
      if (!memberIds.every((id) => own.has(id as string))) throw new ApiError(403, "You can only register members of your own family.");
    }
    const event = await this.repo.eventFee(record.event_id);
    if (!event) throw new ApiError(404, "Event not found.");
    const feePerMember = toMoneyNumber(event.fee);
    const totalFee = feePerMember * memberIds.length;
    record.fee_per_member = feePerMember;
    record.total_fee = totalFee;
    record.payment_status = totalFee === 0 ? "SUCCESS" : "PENDING";
    record.registered_by_id = user.id;
  }

  // Members may only request transfers for their own family/member/student
  // records, and requests always start PENDING.
  private async applyTransferRequestRules(record: RecordBody, user: UserRow): Promise<void> {
    const ownFamilyId = await this.repo.ownFamilyId(user);
    if (record.source_family_id && record.source_family_id !== ownFamilyId) throw new ApiError(403, "You can only request a transfer for your own family.");
    if (record.source_membership_id) {
      const member = await this.repo.familyIdOfMembership(record.source_membership_id);
      if (!member || member.family_id !== ownFamilyId) throw new ApiError(403, "You can only request a transfer for a member of your own family.");
    }
    if (record.source_student_id) {
      const student = await this.repo.studentForTransfer(record.source_student_id);
      const ownEmail = String(user.email || "").toLowerCase();
      const matchesOwnRecord =
        student && ((student.email && String(student.email).toLowerCase() === ownEmail) || (ownFamilyId && student.linked_family_id === ownFamilyId));
      if (!matchesOwnRecord) throw new ApiError(403, "You can only request a transfer for your own student record.");
    }
    record.requester_id = user.id;
    record.status = "PENDING";
  }

  private async validateApplication(record: RecordBody): Promise<void> {
    if (!record.mobile || normalizeMobile(record.mobile).length !== 10) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (blank(record.family_name)) throw new ApiError(400, "Family name is required.");
    if (!record.email || !EMAIL_PATTERN.test(record.email as string)) throw new ApiError(400, "A valid email address is required.");
    if (blank(record.address)) throw new ApiError(400, "Address is required.");
    if (blank(record.city)) throw new ApiError(400, "City is required.");
    if (blank(record.district)) throw new ApiError(400, "District is required.");
    if (await this.availability.isMobileTaken(record.mobile)) throw new ApiError(409, "This mobile number is already registered on the portal.");
    if (await this.availability.isEmailTaken(record.email)) throw new ApiError(409, "This email is already registered on the portal.");
  }

  private async validateStudentApplication(record: RecordBody): Promise<void> {
    if (blank(record.student_name)) throw new ApiError(400, "Student name is required.");
    if (!record.mobile || normalizeMobile(record.mobile).length !== 10) throw new ApiError(400, "A valid 10-digit mobile number is required.");
    if (record.guardian_mobile && normalizeMobile(record.guardian_mobile).length !== 10)
      throw new ApiError(400, "Guardian mobile number must be a valid 10-digit number.");
    if (!record.email || !EMAIL_PATTERN.test(record.email as string)) throw new ApiError(400, "A valid email address is required.");
    if (blank(record.gender)) throw new ApiError(400, "Gender is required.");
    if (blank(record.father_name)) throw new ApiError(400, "Father's name is required.");
    if (blank(record.academic_year)) throw new ApiError(400, "Academic year is required.");
    if (await this.availability.isMobileTaken(record.mobile)) throw new ApiError(409, "This mobile number is already registered on the portal.");
    if (await this.availability.isEmailTaken(record.email)) throw new ApiError(409, "This email is already registered on the portal.");
  }

  private async findOrFail(table: string, id: string) {
    return (await this.repo.findById(table, id)) as NonNullable<Awaited<ReturnType<EntitiesRepository["findById"]>>>;
  }

  private async sendApplicationEmails(application: EntityVo): Promise<void> {
    const name = (application.family_head_name as string) || "Member";
    const loginUrl = `${this.config.frontendUrl}/login`;
    if (application.email) {
      const welcome = memberWelcomeEmail({ name, loginUrl });
      await this.mail.send({ to: application.email as string, subject: welcome.subject, html: welcome.html, text: welcome.text });
    }
    const registeredAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const admin = adminNewApplicationEmail({
      name,
      email: application.email,
      phone: application.mobile,
      applicationId: application.application_id,
      familyName: application.family_name,
      city: application.city,
      registeredAt,
    });
    await this.mail.send({ to: this.config.adminEmails.join(","), subject: admin.subject, html: admin.html, text: admin.text });
  }
}
