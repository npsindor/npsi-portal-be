import { Injectable } from "@nestjs/common";
import { communityAccount } from "../common/eligibility/community-account.js";
import { ApiError } from "../common/filters/api-error.js";
import { RECAPTCHA_FAILED, RecaptchaService } from "../common/recaptcha/recaptcha.service.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { guardianNameOf } from "../common/utils/family-relations.js";
import { assertNoMarkup } from "../common/utils/markup.js";
import { type Db, PrismaService } from "../database/prisma.service.js";
import type { EventMemberApplication, EventMemberSection, Prisma } from "../generated/prisma/client.js";
import {
  type EventMemberApplyDto,
  type EventMemberRemoveDto,
  type EventMemberReviewDto,
  type EventMemberSectionDto,
  type EventMemberUpdateDto,
  OTHER_SECTION,
} from "./event-members.dto.js";

const ACTIVE_MEMBER = ["ACTIVE", "Active", "APPROVED"];
const OPEN = ["PENDING", "APPROVED"];
const digits = (value: string | null | undefined) =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-10);
const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim() || null;
// A photo is either one already on the person's record or a fresh upload to this API's own /uploads.
export const OWN_UPLOAD = /^(https?:\/\/[^\s"'<>]+)?\/(api\/v1\/)?uploads\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/i;

type Person = { memberId: string | null; studentId: string | null; mobileDigits: string | null };
// One open (PENDING/APPROVED) application per person per section; the database enforces it through active_key.
export const activeKeyOf = (sectionId: string | null, customEventName: string | null, person: Person, id: string): string => {
  const section = sectionId ?? `OTHER:${(customEventName ?? "").toLowerCase()}`;
  const who = person.memberId
    ? `M:${person.memberId}`
    : person.studentId
      ? `S:${person.studentId}`
      : person.mobileDigits
        ? `P:${person.mobileDigits}`
        : `A:${id}`;
  return `${section}|${who}`.slice(0, 400);
};

export interface Candidate {
  kind: "MEMBER" | "STUDENT";
  id: string;
  name: string;
  fatherName: string | null;
  village: string | null;
  mobile: string | null;
  email: string | null;
  photoUrl: string | null;
  self: boolean;
}

// What the website shows: never family/student/member ids; mobile and email only with the member's own consent.
export const toPublicCard = (row: EventMemberApplication) => ({
  id: row.id,
  name: row.name,
  designation: row.designation,
  designationHi: row.designationHi,
  photoUrl: row.photoUrl,
  village: row.village,
  area: row.area,
  mobile: row.mobilePublic && row.mobileDigits?.length === 10 ? row.mobileDigits : null,
  email: row.emailPublic ? row.email : null,
});

const sectionView = (section: EventMemberSection) => ({
  key: section.key,
  label: section.label,
  labelHi: section.labelHi,
  heading: section.heading,
  headingHi: section.headingHi,
  isCoreTeam: section.isCoreTeam,
});

const log = (db: Db, applicationId: string, action: string, actorId: string | null, remarks?: string | null, changes?: Prisma.InputJsonValue) =>
  db.eventMemberApplicationLog.create({ data: { id: randomId(), applicationId, action, actorId, remarks: remarks ?? null, changes } });

@Injectable()
export class EventMembersService {
  constructor(
    private readonly db: PrismaService,
    private readonly recaptcha: RecaptchaService,
  ) {}

  private admin(user: UserRow) {
    if (user.role !== "admin") throw new ApiError(403, "Admin access required.");
  }

  // ---------- public ----------

  // The "Become a Member" dropdown: active sections that accept applications (OTHER is added by the form).
  async openSections() {
    const rows = await this.db.eventMemberSection.findMany({ where: { status: "ACTIVE", accepting: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
    return rows.map(sectionView);
  }

  // Team cards for a section (?section=CORE_TEAM) or for every section shown on an event page (?event=slug).
  async teams(query: { section?: string; event?: string }) {
    let event: Awaited<ReturnType<PrismaService["event"]["findFirst"]>> = null;
    let sections: EventMemberSection[];
    if (query.event) {
      event = await this.db.event.findFirst({ where: { OR: [{ slug: query.event }, { id: query.event }], status: "PUBLISHED" } });
      if (!event) throw new ApiError(404, "EVENT_NOT_FOUND");
      sections = await this.db.eventMemberSection.findMany({ where: { eventId: event.id, status: "ACTIVE" }, orderBy: { sortOrder: "asc" } });
    } else {
      const section = await this.db.eventMemberSection.findFirst({ where: { key: String(query.section || "").toUpperCase(), status: "ACTIVE" } });
      if (!section) throw new ApiError(404, "EM_SECTION");
      sections = [section];
      if (section.eventId) event = await this.db.event.findFirst({ where: { id: section.eventId, status: "PUBLISHED" } });
    }
    const members = await this.db.eventMemberApplication.findMany({
      where: { sectionId: { in: sections.map((section) => section.id) }, status: "APPROVED", showOnWebsite: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
      take: 2000,
    });
    return {
      event: event
        ? {
            id: event.id,
            slug: event.slug,
            title: event.title,
            titleHi: event.titleHi,
            date: event.date.toISOString().slice(0, 10),
            venue: event.venue,
            bannerUrl: event.bannerUrl,
            description: event.description,
            descriptionHi: event.descriptionHi,
          }
        : null,
      sections: sections.map((section) => ({
        ...sectionView(section),
        members: members.filter((row) => row.sectionId === section.id).map(toPublicCard),
      })),
    };
  }

  // ---------- logged-in member / student ----------

  // The account's own people (its family's active members, its own / its family's students) with their details for
  // autofill, plus the account's applications. Nobody else's data is returned.
  async candidates(user: UserRow) {
    const account = await communityAccount(this.db, user);
    const familyId = account?.familyId ?? null;
    const [family, members, students] = await Promise.all([
      familyId ? this.db.family.findFirst({ where: { familyId }, select: { headName: true, village: true, nativePlace: true } }) : null,
      familyId ? this.db.familyMember.findMany({ where: { familyId, status: { in: ACTIVE_MEMBER } }, orderBy: { name: "asc" }, take: 50 }) : [],
      this.db.student.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ userId: user.id }, ...(user.email ? [{ email: user.email }] : []), ...(familyId ? [{ linkedFamilyId: familyId }] : [])],
        },
        orderBy: { studentName: "asc" },
        take: 20,
      }),
    ]);
    const village = family?.village || family?.nativePlace || null;
    const fatherInFamily = members.find((member) => member.relationship?.toLowerCase() === "father")?.name ?? null;
    const email = user.email?.toLowerCase() ?? null;
    const list: Candidate[] = members.map((member) => ({
      kind: "MEMBER",
      id: member.id,
      name: member.name,
      fatherName: guardianNameOf(member, { headName: family?.headName }, fatherInFamily),
      village,
      mobile: digits(member.mobile) || null,
      email: member.email || (member.id === account?.memberId ? user.email : null),
      photoUrl: member.photoUrl || students.find((item) => item.studentId && item.studentId === member.linkedStudentId)?.photoUrl || null,
      self: member.id === account?.memberId || Boolean(email && member.email?.toLowerCase() === email),
    }));
    for (const student of students) {
      if (!student.studentId || members.some((member) => member.linkedStudentId === student.studentId)) continue;
      list.push({
        kind: "STUDENT",
        id: student.studentId,
        name: student.studentName,
        fatherName: student.fatherName || student.guardianName || null,
        village: null,
        mobile: digits(student.mobile) || null,
        email: student.email,
        photoUrl: student.photoUrl || null,
        self: student.userId === user.id || Boolean(email && student.email?.toLowerCase() === email),
      });
    }
    // The account holder first: their own details are the default autofill.
    list.sort((a, b) => Number(b.self) - Number(a.self));
    return { candidates: list, applications: await this.mine(user) };
  }

  async mine(user: UserRow) {
    const rows = await this.db.eventMemberApplication.findMany({
      where: { userId: user.id },
      include: { section: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      section: row.section ? sectionView(row.section) : null,
      customEventName: row.customEventName,
      name: row.name,
      status: row.status,
      rejectionReason: row.rejectionReason,
      showOnWebsite: row.showOnWebsite,
      mobilePublic: row.mobilePublic,
      emailPublic: row.emailPublic,
      createdAt: row.createdAt,
    }));
  }

  // The chosen record and its details. A registered member / student applying with one click sends no details at
  // all: name, mobile, email, village and photo come from their own record.
  private async person(input: EventMemberApplyDto, user: UserRow | null) {
    if (!input.personKind || !input.personId) return null;
    if (!user) throw new ApiError(403, "EM_PERSON");
    if (user.role !== "admin") {
      const { candidates } = await this.candidates(user);
      const own = candidates.find((item) => item.kind === input.personKind && item.id === input.personId);
      if (!own) throw new ApiError(403, "EM_PERSON");
      const record = await this.record(input.personKind, own.id);
      return { ...record, name: own.name, mobile: own.mobile, email: own.email, village: own.village ?? record.village };
    }
    return this.record(input.personKind, input.personId);
  }

  private async record(kind: "MEMBER" | "STUDENT", id: string) {
    if (kind === "MEMBER") {
      const member = await this.db.familyMember.findFirst({
        where: { id, status: { in: ACTIVE_MEMBER } },
        include: { family: { select: { village: true, nativePlace: true } } },
      });
      if (!member) throw new ApiError(404, "EM_PERSON");
      return {
        memberId: member.id,
        studentId: member.linkedStudentId,
        familyId: member.familyId,
        photoUrl: member.photoUrl,
        name: member.name,
        mobile: member.mobile,
        email: member.email,
        village: member.family?.village || member.family?.nativePlace || null,
      };
    }
    const student = await this.db.student.findFirst({ where: { studentId: id, status: "ACTIVE" } });
    if (!student) throw new ApiError(404, "EM_PERSON");
    return {
      memberId: null,
      studentId: student.studentId,
      familyId: student.linkedFamilyId,
      photoUrl: student.photoUrl,
      name: student.studentName,
      mobile: student.mobile,
      email: student.email,
      village: null,
    };
  }

  private async sectionFor(key: string | undefined, forAdmin: boolean) {
    const value = String(key || "").toUpperCase();
    if (value === OTHER_SECTION) return null;
    const section = await this.db.eventMemberSection.findFirst({ where: { key: value, status: "ACTIVE", ...(forAdmin ? {} : { accepting: true }) } });
    if (!section) throw new ApiError(400, "EM_SECTION");
    return section;
  }

  // Someone already has an open application for this section (same member, student or mobile).
  private async assertNoOpen(db: Db, sectionId: string | null, customEventName: string | null, person: Person, exceptId?: string) {
    const who = [
      ...(person.memberId ? [{ memberId: person.memberId }] : []),
      ...(person.studentId ? [{ studentId: person.studentId }] : []),
      ...(person.mobileDigits ? [{ mobileDigits: person.mobileDigits }] : []),
    ];
    if (!who.length) return;
    const same = await db.eventMemberApplication.findFirst({
      where: {
        status: { in: OPEN },
        ...(sectionId ? { sectionId } : { sectionId: null, customEventName: customEventName ?? "" }),
        OR: who,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (same) throw new ApiError(409, "EM_DUPLICATE");
  }

  // The one application form. Logged out: reCAPTCHA, not linked to any record (no lookup of existing members).
  // Logged in: may pick one of the account's own people, whose record ids are linked; the details typed in the form
  // belong to the event profile only and never change the member's or student's master record.
  async apply(input: EventMemberApplyDto, user: UserRow | null) {
    assertNoMarkup(input);
    if (!user && !(await this.recaptcha.verify(input.recaptchaToken))) throw new ApiError(400, RECAPTCHA_FAILED);
    const isAdmin = user?.role === "admin";
    const section = await this.sectionFor(input.sectionKey, isAdmin);
    const customEventName = section ? null : clean(input.customEventName);
    if (!section && !customEventName) throw new ApiError(400, "EM_OTHER_NAME");
    const person = await this.person(input, user);
    const photoUrl = clean(input.photoUrl);
    if (photoUrl && photoUrl !== person?.photoUrl && !OWN_UPLOAD.test(photoUrl)) throw new ApiError(400, "EM_PHOTO");
    // Typed details win (the full form); a one-click request from a registered member uses their record. Without a
    // linked record every detail is required.
    const name = clean(input.name) ?? clean(person?.name);
    const mobileDigits = digits(input.mobile || person?.mobile);
    const email = (clean(input.email) ?? clean(person?.email))?.toLowerCase() ?? null;
    const village = clean(input.village) ?? clean(person?.village);
    const area = clean(input.area);
    if (!name || name.length < 2) throw new ApiError(400, "EM_NAME");
    if (mobileDigits.length !== 10) throw new ApiError(400, "EM_MOBILE");
    if (!person) {
      if (!email) throw new ApiError(400, "EM_EMAIL");
      if (!village) throw new ApiError(400, "EM_VILLAGE");
      if (!area) throw new ApiError(400, "EM_AREA");
    }
    const id = randomId();
    const who = { memberId: person?.memberId ?? null, studentId: person?.studentId ?? null, mobileDigits };
    await this.assertNoOpen(this.db, section?.id ?? null, customEventName, who);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.eventMemberApplication.create({
          data: {
            id,
            sectionId: section?.id ?? null,
            customEventName,
            userId: isAdmin ? null : (user?.id ?? null),
            familyId: person?.familyId ?? null,
            memberId: who.memberId,
            studentId: who.studentId,
            photoUrl: photoUrl || person?.photoUrl || null,
            name,
            mobile: mobileDigits,
            mobileDigits,
            mobilePublic: input.mobilePublic === true,
            email,
            emailPublic: input.emailPublic === true,
            village,
            area,
            status: "PENDING",
            activeKey: activeKeyOf(section?.id ?? null, customEventName, who, id),
            source: isAdmin ? "ADMIN" : user ? "PORTAL" : "PUBLIC",
          },
        });
        await log(tx, row.id, "SUBMITTED", user?.id ?? null, null, {
          section: section?.key ?? OTHER_SECTION,
          customEventName,
          mobilePublic: row.mobilePublic,
          emailPublic: row.emailPublic,
        });
        return { id: row.id, status: row.status };
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ApiError(409, "EM_DUPLICATE");
      throw error;
    }
  }

  async withdraw(id: string, user: UserRow) {
    const row = await this.db.eventMemberApplication.findFirst({ where: { id, userId: user.id } });
    if (!row) throw new ApiError(404, "EM_NOT_FOUND");
    if (row.status !== "PENDING") throw new ApiError(409, "EM_NOT_PENDING");
    await this.db.$transaction(async (tx) => {
      await tx.eventMemberApplication.update({ where: { id }, data: { status: "WITHDRAWN", activeKey: null } });
      await log(tx, id, "WITHDRAWN", user.id);
    });
    return { id, status: "WITHDRAWN" };
  }

  // ---------- admin ----------

  async list(user: UserRow) {
    this.admin(user);
    const rows = await this.db.eventMemberApplication.findMany({
      include: { section: { select: { key: true, label: true, labelHi: true, heading: true } }, member: { select: { membershipId: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 5000,
    });
    return rows.map(({ member, activeKey: _key, ...row }) => ({ ...row, membershipId: member?.membershipId ?? null }));
  }

  async history(id: string, user: UserRow) {
    this.admin(user);
    if (!(await this.db.eventMemberApplication.findFirst({ where: { id }, select: { id: true } }))) throw new ApiError(404, "EM_NOT_FOUND");
    return this.db.eventMemberApplicationLog.findMany({ where: { applicationId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  }

  // Approving shows the person in their section (and adds them to that event's roster when the section has an event);
  // repeating it changes nothing. Rejecting needs a reason and takes an approved card off the website.
  async review(id: string, input: EventMemberReviewDto, user: UserRow) {
    this.admin(user);
    return this.db.$transaction(async (tx) => {
      const row = await tx.eventMemberApplication.findFirst({ where: { id }, include: { section: true } });
      if (!row) throw new ApiError(404, "EM_NOT_FOUND");
      if (input.decision === "REJECTED") {
        const reason = clean(input.reason);
        if (!reason) throw new ApiError(400, "EM_REASON");
        await this.deactivateRoster(tx, row, user);
        const after = await tx.eventMemberApplication.update({ where: { id }, data: { status: "REJECTED", rejectionReason: reason, activeKey: null } });
        await log(tx, id, "REJECTED", user.id, reason);
        return after;
      }
      const section = input.sectionKey ? await this.sectionFor(input.sectionKey, true) : row.section;
      if (!section) throw new ApiError(400, "EM_SECTION_REQUIRED");
      if (row.status === "APPROVED" && row.sectionId === section.id) {
        await this.syncRoster(tx, row, section, user); // repeated approval: same row, no new roster entry
        return row;
      }
      const who = { memberId: row.memberId, studentId: row.studentId, mobileDigits: row.mobileDigits };
      await this.assertNoOpen(tx, section.id, null, who, id);
      if (row.section && row.section.id !== section.id) await this.deactivateRoster(tx, row, user);
      const after = await tx.eventMemberApplication.update({
        where: { id },
        data: {
          status: "APPROVED",
          sectionId: section.id,
          rejectionReason: null,
          approvedById: user.id,
          approvedAt: new Date(),
          activeKey: activeKeyOf(section.id, null, who, id),
        },
      });
      await this.syncRoster(tx, after, section, user);
      await log(tx, id, "APPROVED", user.id, null, {
        section: section.key,
        ...(row.sectionId !== section.id ? { mappedFrom: row.section?.key ?? `${OTHER_SECTION}: ${row.customEventName ?? ""}` } : {}),
      });
      return tx.eventMemberApplication.findUnique({ where: { id } });
    });
  }

  async update(id: string, input: EventMemberUpdateDto, user: UserRow) {
    this.admin(user);
    assertNoMarkup(input);
    return this.db.$transaction(async (tx) => {
      const row = await tx.eventMemberApplication.findFirst({ where: { id }, include: { section: true } });
      if (!row) throw new ApiError(404, "EM_NOT_FOUND");
      // Consent belongs to the member: an admin can hide the mobile/email, never publish them.
      if ((input.mobilePublic === true && !row.mobilePublic) || (input.emailPublic === true && !row.emailPublic)) throw new ApiError(400, "EM_CONSENT_OWNER");
      const photoUrl = input.photoUrl === undefined ? undefined : clean(input.photoUrl);
      if (photoUrl && photoUrl !== row.photoUrl && !OWN_UPLOAD.test(photoUrl)) throw new ApiError(400, "EM_PHOTO");
      const section = input.sectionKey ? await this.sectionFor(input.sectionKey, true) : undefined;
      const data: Prisma.EventMemberApplicationUncheckedUpdateInput = {
        name: input.name === undefined ? undefined : (clean(input.name) ?? row.name),
        designation: input.designation === undefined ? undefined : clean(input.designation),
        designationHi: input.designationHi === undefined ? undefined : clean(input.designationHi),
        village: input.village === undefined ? undefined : clean(input.village),
        area: input.area === undefined ? undefined : clean(input.area),
        photoUrl,
        showOnWebsite: input.showOnWebsite,
        mobilePublic: input.mobilePublic,
        emailPublic: input.emailPublic,
        sortOrder: input.sortOrder,
      };
      if (section && section.id !== row.sectionId) {
        const who = { memberId: row.memberId, studentId: row.studentId, mobileDigits: row.mobileDigits };
        if (OPEN.includes(row.status)) {
          await this.assertNoOpen(tx, section.id, null, who, id);
          data.activeKey = activeKeyOf(section.id, null, who, id);
        }
        data.sectionId = section.id;
        if (row.status === "APPROVED") await this.deactivateRoster(tx, row, user);
      }
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [key, value] of Object.entries(data)) {
        const before = (row as Record<string, unknown>)[key];
        if (value !== undefined && key !== "activeKey" && value !== before) changes[key] = { from: before ?? null, to: value };
      }
      const after = await tx.eventMemberApplication.update({ where: { id }, data });
      if (after.status === "APPROVED") {
        const current = await tx.eventMemberSection.findUnique({ where: { id: after.sectionId ?? "" } });
        if (current) await this.syncRoster(tx, after, current, user);
      }
      if (Object.keys(changes).length) await log(tx, id, "UPDATED", user.id, null, changes as Prisma.InputJsonValue);
      return after;
    });
  }

  // Ends the event membership only; the person's family/student record and login are untouched.
  async remove(id: string, input: EventMemberRemoveDto, user: UserRow) {
    this.admin(user);
    const reason = clean(input.reason);
    if (!reason) throw new ApiError(400, "EM_REASON");
    return this.db.$transaction(async (tx) => {
      const row = await tx.eventMemberApplication.findFirst({ where: { id } });
      if (!row) throw new ApiError(404, "EM_NOT_FOUND");
      await this.deactivateRoster(tx, row, user);
      const after = await tx.eventMemberApplication.update({ where: { id }, data: { status: "REMOVED", activeKey: null, rejectionReason: reason } });
      await log(tx, id, "REMOVED", user.id, reason);
      return after;
    });
  }

  // Admin search of existing members and students, to file an application for someone already registered.
  async people(query: string, user: UserRow) {
    this.admin(user);
    const q = query.trim();
    if (q.length < 2) return [];
    const phone = digits(q);
    const [members, students] = await Promise.all([
      this.db.familyMember.findMany({
        where: {
          status: { in: ACTIVE_MEMBER },
          OR: [
            { name: { contains: q } },
            { membershipId: { contains: q } },
            { familyId: { contains: q } },
            ...(phone.length >= 6 ? [{ mobileDigits: { contains: phone } }] : []),
          ],
        },
        include: { family: { select: { village: true, nativePlace: true } } },
        orderBy: { name: "asc" },
        take: 15,
      }),
      this.db.student.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ studentName: { contains: q } }, { studentId: { contains: q } }, ...(phone.length >= 6 ? [{ mobileDigits: { contains: phone } }] : [])],
        },
        orderBy: { studentName: "asc" },
        take: 10,
      }),
    ]);
    return [
      ...members.map((member) => ({
        kind: "MEMBER" as const,
        id: member.id,
        name: member.name,
        village: member.family?.village || member.family?.nativePlace || null,
        mobile: digits(member.mobile) || null,
        email: member.email,
        photoUrl: member.photoUrl,
        familyId: member.familyId,
        membershipId: member.membershipId,
        studentId: member.linkedStudentId,
      })),
      ...students
        .filter((student) => !members.some((member) => member.linkedStudentId && member.linkedStudentId === student.studentId))
        .map((student) => ({
          kind: "STUDENT" as const,
          id: student.studentId as string,
          name: student.studentName,
          village: null,
          mobile: digits(student.mobile) || null,
          email: student.email,
          photoUrl: student.photoUrl,
          familyId: student.linkedFamilyId,
          membershipId: student.linkedMembershipId,
          studentId: student.studentId,
        })),
    ];
  }

  async adminSections(user: UserRow) {
    this.admin(user);
    const [sections, counts] = await Promise.all([
      this.db.eventMemberSection.findMany({
        include: { event: { select: { id: true, title: true, slug: true } } },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
      this.db.eventMemberApplication.groupBy({ by: ["sectionId", "status"], _count: { _all: true } }),
    ]);
    const count = (sectionId: string | null, status: string) => counts.find((row) => row.sectionId === sectionId && row.status === status)?._count._all ?? 0;
    return {
      sections: sections.map((section) => ({ ...section, approved: count(section.id, "APPROVED"), pending: count(section.id, "PENDING") })),
      other: { pending: count(null, "PENDING") },
    };
  }

  async saveSection(input: EventMemberSectionDto, user: UserRow, id?: string) {
    this.admin(user);
    assertNoMarkup(input);
    if (input.eventId && !(await this.db.event.findFirst({ where: { id: input.eventId }, select: { id: true } }))) throw new ApiError(400, "EVENT_NOT_FOUND");
    const data = {
      label: input.label === undefined ? undefined : (clean(input.label) ?? undefined),
      labelHi: input.labelHi === undefined ? undefined : clean(input.labelHi),
      heading: input.heading === undefined ? undefined : (clean(input.heading) ?? undefined),
      headingHi: input.headingHi === undefined ? undefined : clean(input.headingHi),
      eventId: input.eventId === undefined ? undefined : input.eventId || null,
      accepting: input.accepting,
      status: input.status,
      sortOrder: input.sortOrder,
    };
    if (id) {
      if (!(await this.db.eventMemberSection.findFirst({ where: { id }, select: { id: true } }))) throw new ApiError(404, "EM_SECTION");
      return this.db.eventMemberSection.update({ where: { id }, data });
    }
    if (!data.label || !data.heading) throw new ApiError(400, "EM_SECTION_FIELDS");
    const base =
      data.label
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 30) || "TEAM";
    let key = base === OTHER_SECTION ? "OTHER_TEAM" : base;
    for (let n = 2; await this.db.eventMemberSection.findFirst({ where: { key }, select: { id: true } }); n++) key = `${base}_${n}`;
    const last = await this.db.eventMemberSection.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    return this.db.eventMemberSection.create({
      data: {
        id: randomId(),
        key,
        label: data.label,
        labelHi: data.labelHi ?? null,
        heading: data.heading,
        headingHi: data.headingHi ?? null,
        eventId: data.eventId ?? null,
        accepting: data.accepting ?? true,
        status: data.status ?? "ACTIVE",
        sortOrder: data.sortOrder ?? (last ? last.sortOrder + 1 : 1),
      },
    });
  }

  // ---------- event roster ----------

  // The approved member is on the event's roster too (Event Finance keeps using it). One roster row per person: an
  // existing row for the same member/student is reused, and a repeated approval updates the same row.
  private async syncRoster(tx: Db, app: EventMemberApplication, section: EventMemberSection, user: UserRow) {
    if (!section.eventId) return;
    const eventId = section.eventId;
    let row = app.rosterId ? await tx.eventRoster.findFirst({ where: { id: app.rosterId } }) : null;
    if (row && row.eventId !== eventId) row = null;
    if (!row && app.memberId) row = await tx.eventRoster.findFirst({ where: { eventId, memberId: app.memberId } });
    if (!row && app.studentId) row = await tx.eventRoster.findFirst({ where: { eventId, studentId: app.studentId } });
    const member = app.memberId ? await tx.familyMember.findFirst({ where: { id: app.memberId }, select: { membershipId: true, familyId: true } }) : null;
    const details = {
      memberName: app.name,
      village: app.village,
      mobile: app.mobileDigits,
      area: app.area,
      photoUrl: app.photoUrl,
      showMobile: app.mobilePublic,
      showOnWebsite: app.showOnWebsite,
      reviewStatus: "APPROVED",
      status: "ACTIVE",
      deletedAt: null,
      updatedById: user.id,
    };
    if (row) {
      await tx.eventMemberApplication.updateMany({ where: { rosterId: row.id, NOT: { id: app.id } }, data: { rosterId: null } });
      await tx.eventRoster.update({ where: { id: row.id }, data: details });
    } else {
      row = await tx.eventRoster.create({
        data: {
          id: randomId(),
          eventId,
          memberId: app.memberId,
          studentId: app.studentId,
          userId: app.userId,
          familyId: member?.familyId ?? app.familyId,
          membershipId: member?.membershipId ?? null,
          source: "APPLICATION",
          createdById: user.id,
          ...details,
        },
      });
    }
    if (app.rosterId !== row.id) await tx.eventMemberApplication.update({ where: { id: app.id }, data: { rosterId: row.id } });
  }

  private async deactivateRoster(tx: Db, app: EventMemberApplication, user: UserRow) {
    if (!app.rosterId) return;
    await tx.eventRoster.updateMany({ where: { id: app.rosterId }, data: { status: "INACTIVE", showOnWebsite: false, updatedById: user.id } });
  }
}
