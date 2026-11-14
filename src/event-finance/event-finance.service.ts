import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { randomId } from "../common/utils/crypto.js";
import { parseDate } from "../common/utils/dates.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  EventContributionDto,
  EventExpenseDto,
  EventResponsibilityDto,
  EventRosterDto,
  EventTeamDto,
  ExpenseCategoryDto,
  RosterImportDto,
  RosterImportRowDto,
} from "./event-finance.dto.js";

const number = (value: Prisma.Decimal | number | null | undefined) => (value == null ? 0 : typeof value === "number" ? value : value.toNumber());
const clean = (value: string | null | undefined) => value?.trim() || null;
const mobileDigits = (value: string | null | undefined) => value?.replace(/\D/g, "") || "";
const validMobile = (value: string | null | undefined) => !value || /^[6-9]\d{9}$/.test(mobileDigits(value));

@Injectable()
export class EventFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertMember(user: UserRow) {
    const digits = mobileDigits(user.phone);
    const family = await this.prisma.family.findFirst({
      where: {
        status: { in: ["ACTIVE", "APPROVED"] },
        OR: [
          { ownerUserId: user.id },
          ...(user.email ? [{ email: user.email }] : []),
          ...(digits ? [{ contactDigits: digits }, { members: { some: { mobileDigits: digits, status: "ACTIVE" } } }] : []),
        ],
      },
      select: { id: true, familyId: true },
    });
    if (!family) throw new ApiError(403, "Approved family membership is required to view event finances.");
    return family;
  }

  private async assertEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ApiError(404, "Event not found.");
    return event;
  }

  async list(user: UserRow) {
    if (user.role !== "admin") await this.assertMember(user);
    const events = await this.prisma.event.findMany({
      where: user.role === "admin" ? { status: { not: "ARCHIVED" } } : { status: "PUBLISHED" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, title: true, titleHi: true, date: true, venue: true, description: true, descriptionHi: true, bannerUrl: true, status: true },
    });
    return Promise.all(events.map(async (event) => ({ ...event, ...(await this.summary(event.id)) })));
  }

  private async summary(eventId: string) {
    const [contributions, pendingContributions, expenses, pendingExpenses, approvedRows] = await Promise.all([
      this.prisma.eventContribution.aggregate({ where: { eventId, status: "APPROVED", deletedAt: null }, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.eventContribution.aggregate({ where: { eventId, status: "PENDING", deletedAt: null }, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.eventExpense.aggregate({ where: { eventId, status: "APPROVED", deletedAt: null }, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.eventExpense.aggregate({ where: { eventId, status: "PENDING", deletedAt: null }, _sum: { amount: true }, _count: { id: true } }),
      this.prisma.eventContribution.findMany({
        where: { eventId, status: "APPROVED", deletedAt: null },
        select: { id: true, memberId: true, familyId: true, memberName: true, mobile: true, village: true },
      }),
    ]);
    const totalCollection = number(contributions._sum.amount);
    const totalExpenses = number(expenses._sum.amount);
    return {
      totalCollection,
      totalExpenses,
      remainingBalance: totalCollection - totalExpenses,
      pendingContributions: number(pendingContributions._sum.amount),
      pendingContributionCount: pendingContributions._count.id,
      pendingExpenses: number(pendingExpenses._sum.amount),
      pendingExpenseCount: pendingExpenses._count.id,
      contributorCount: new Set(
        approvedRows.map((row) =>
          row.memberId
            ? `member:${row.memberId}`
            : row.mobile
              ? `mobile:${mobileDigits(row.mobile)}`
              : row.familyId
                ? `family:${row.familyId}:${row.memberName.toLowerCase()}`
                : `contribution:${row.id}`,
        ),
      ).size,
      villageCount: new Set(approvedRows.map((row) => row.village?.trim()).filter(Boolean)).size,
    };
  }

  async detail(eventId: string, user: UserRow) {
    if (user.role !== "admin") await this.assertMember(user);
    const event = await this.assertEvent(eventId);
    if (user.role !== "admin" && event.status !== "PUBLISHED") throw new ApiError(404, "Event not found.");
    const [summary, contributionRows, expenseRows, categoryGroups, villageGroups] = await Promise.all([
      this.summary(eventId),
      this.prisma.eventContribution.findMany({
        where: { eventId, deletedAt: null, ...(user.role === "admin" ? {} : { status: "APPROVED" }) },
        orderBy: { contributedAt: "desc" },
        select: {
          id: true,
          memberId: true,
          memberName: true,
          familyId: true,
          village: true,
          mobile: true,
          amount: true,
          paymentMode: true,
          paymentReference: true,
          status: true,
          contributedAt: true,
        },
      }),
      this.prisma.eventExpense.findMany({
        where: { eventId, deletedAt: null, ...(user.role === "admin" ? {} : { status: { in: ["APPROVED", "PENDING"] } }) },
        include: { category: { select: { id: true, name: true } } },
        orderBy: { expenseDate: "desc" },
      }),
      this.prisma.eventExpense.groupBy({ by: ["categoryId"], where: { eventId, status: "APPROVED", deletedAt: null }, _sum: { amount: true } }),
      this.prisma.eventContribution.groupBy({
        by: ["village"],
        where: { eventId, status: "APPROVED", deletedAt: null },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: categoryGroups.map((row) => row.categoryId) } },
      select: { id: true, name: true },
    });
    const categoryById = new Map(categories.map((row) => [row.id, row.name]));
    // Members see who gave how much, never another family's ids, payment reference (UPI/transaction id) or full mobile.
    const contributions = contributionRows.map((row) =>
      user.role === "admin"
        ? { ...row, amount: number(row.amount) }
        : {
            id: row.id,
            memberName: row.memberName,
            village: row.village,
            mobile: row.mobile ? `******${row.mobile.slice(-4)}` : null,
            amount: number(row.amount),
            paymentMode: row.paymentMode,
            status: row.status,
            contributedAt: row.contributedAt,
          },
    );
    const expenses = expenseRows.map((row) => ({ ...row, amount: number(row.amount) }));
    const villages = villageGroups.map((row) => ({
      village: row.village || "—",
      contributors: row._count.id,
      collection: number(row._sum.amount),
      expenses: 0,
    }));
    return {
      event,
      summary,
      contributions,
      expenses,
      categoryTotals: categoryGroups.map((row) => ({
        categoryId: row.categoryId,
        category: categoryById.get(row.categoryId) || "Other",
        amount: number(row._sum.amount),
      })),
      villages,
      canManage: user.role === "admin",
    };
  }

  async categories() {
    return this.prisma.expenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }

  async saveCategory(dto: ExpenseCategoryDto, id?: string) {
    const name = dto.name.trim();
    if (!name) throw new ApiError(400, "Category name is required.");
    try {
      if (id) {
        const result = await this.prisma.expenseCategory.updateMany({ where: { id }, data: { name, active: dto.active, sortOrder: dto.sortOrder } });
        if (!result.count) throw new ApiError(404, "Expense category not found.");
        return this.prisma.expenseCategory.findUnique({ where: { id } });
      }
      return this.prisma.expenseCategory.create({ data: { id: randomId(), name, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 0 } });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ApiError(409, "An expense category with this name already exists.");
      throw error;
    }
  }

  async deactivateCategory(id: string) {
    const changed = await this.prisma.expenseCategory.updateMany({ where: { id }, data: { active: false } });
    if (!changed.count) throw new ApiError(404, "Expense category not found.");
  }

  private async audit(
    tx: Prisma.TransactionClient,
    eventId: string,
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    const jsonValue = (value: unknown) => (value == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue));
    await tx.eventFinancialAuditLog.create({
      data: {
        id: randomId(),
        eventId,
        actorId,
        entityType,
        entityId,
        action,
        before: jsonValue(before),
        after: jsonValue(after),
      },
    });
  }

  async saveContribution(eventId: string, dto: EventContributionDto, actor: UserRow, id?: string) {
    await this.assertEvent(eventId);
    if (!validMobile(dto.mobile)) throw new ApiError(400, "Enter a valid 10-digit mobile number.");
    if (dto.memberId && !(await this.prisma.familyMember.findUnique({ where: { id: dto.memberId } }))) throw new ApiError(400, "Family member not found.");
    const data: Omit<Prisma.EventContributionUncheckedCreateInput, "id"> = {
      eventId,
      memberId: dto.memberId || null,
      memberName: dto.memberName.trim(),
      familyId: clean(dto.familyId),
      village: clean(dto.village),
      mobile: clean(dto.mobile),
      amount: dto.amount,
      paymentMode: dto.paymentMode,
      paymentReference: clean(dto.paymentReference),
      status: dto.status ?? "PENDING",
      contributedAt: parseDate(dto.contributedAt) || new Date(),
      createdById: actor.id,
      updatedById: actor.id,
    };
    if (!data.memberName) throw new ApiError(400, "Member name is required.");
    return this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.eventContribution.findFirst({ where: { id, eventId, deletedAt: null } }) : null;
      if (id && !before) throw new ApiError(404, "Contribution not found.");
      const row = id
        ? await tx.eventContribution.update({ where: { id }, data: { ...data, createdById: undefined } })
        : await tx.eventContribution.create({ data: { ...data, id: randomId() } });
      await this.audit(tx, eventId, actor.id, "CONTRIBUTION", row.id, id ? "UPDATE" : "CREATE", before, row);
      return { ...row, amount: number(row.amount) };
    });
  }

  async reviewContribution(eventId: string, id: string, status: string, actor: UserRow) {
    if (!["APPROVED", "REJECTED"].includes(status)) throw new ApiError(400, "Invalid contribution decision.");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.eventContribution.findFirst({ where: { id, eventId, deletedAt: null } });
      if (!before) throw new ApiError(404, "Contribution not found.");
      const after = await tx.eventContribution.update({ where: { id }, data: { status, updatedById: actor.id } });
      await this.audit(tx, eventId, actor.id, "CONTRIBUTION", id, "REVIEW", before, after);
      return { ...after, amount: number(after.amount) };
    });
  }

  async deleteContribution(eventId: string, id: string, actor: UserRow) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.eventContribution.findFirst({ where: { id, eventId, deletedAt: null } });
      if (!before) throw new ApiError(404, "Contribution not found.");
      const after = await tx.eventContribution.update({ where: { id }, data: { status: "VOIDED", deletedAt: new Date(), updatedById: actor.id } });
      await this.audit(tx, eventId, actor.id, "CONTRIBUTION", id, "VOID", before, after);
    });
  }

  async saveExpense(eventId: string, dto: EventExpenseDto, actor: UserRow, id?: string) {
    await this.assertEvent(eventId);
    const category = await this.prisma.expenseCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category || (!category.active && !id)) throw new ApiError(400, "Choose an active expense category.");
    if (!validMobile(dto.vendorMobile)) throw new ApiError(400, "Enter a valid vendor mobile number.");
    const data: Omit<Prisma.EventExpenseUncheckedCreateInput, "id"> = {
      eventId,
      categoryId: dto.categoryId,
      title: dto.title.trim(),
      description: clean(dto.description),
      amount: dto.amount,
      vendorName: clean(dto.vendorName),
      vendorMobile: clean(dto.vendorMobile),
      invoiceNumber: clean(dto.invoiceNumber),
      expenseDate: parseDate(dto.expenseDate)!,
      paymentMode: dto.paymentMode,
      paymentReference: clean(dto.paymentReference),
      receiptUrl: clean(dto.receiptUrl),
      notes: clean(dto.notes),
      paymentStatus: dto.paymentStatus,
      status: dto.status ?? "PENDING",
      approvedById: dto.status === "APPROVED" ? actor.id : null,
      approvedAt: dto.status === "APPROVED" ? new Date() : null,
      createdById: actor.id,
      updatedById: actor.id,
    };
    if (!data.title) throw new ApiError(400, "Expense title is required.");
    return this.prisma.$transaction(async (tx) => {
      const before = id ? await tx.eventExpense.findFirst({ where: { id, eventId, deletedAt: null } }) : null;
      if (id && !before) throw new ApiError(404, "Expense not found.");
      const row = id
        ? await tx.eventExpense.update({ where: { id }, data: { ...data, createdById: undefined } })
        : await tx.eventExpense.create({ data: { ...data, id: randomId() } });
      await this.audit(tx, eventId, actor.id, "EXPENSE", row.id, id ? "UPDATE" : "CREATE", before, row);
      return { ...row, amount: number(row.amount) };
    });
  }

  async reviewExpense(eventId: string, id: string, status: string, actor: UserRow) {
    if (!["APPROVED", "REJECTED"].includes(status)) throw new ApiError(400, "Invalid expense decision.");
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.eventExpense.findFirst({ where: { id, eventId, deletedAt: null } });
      if (!before) throw new ApiError(404, "Expense not found.");
      const after = await tx.eventExpense.update({
        where: { id },
        data: { status, approvedById: status === "APPROVED" ? actor.id : null, approvedAt: status === "APPROVED" ? new Date() : null, updatedById: actor.id },
      });
      await this.audit(tx, eventId, actor.id, "EXPENSE", id, "REVIEW", before, after);
      return { ...after, amount: number(after.amount) };
    });
  }

  async deleteExpense(eventId: string, id: string, actor: UserRow) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.eventExpense.findFirst({ where: { id, eventId, deletedAt: null } });
      if (!before) throw new ApiError(404, "Expense not found.");
      const after = await tx.eventExpense.update({ where: { id }, data: { status: "VOIDED", deletedAt: new Date(), updatedById: actor.id } });
      await this.audit(tx, eventId, actor.id, "EXPENSE", id, "VOID", before, after);
    });
  }

  private async rosterData(
    eventId: string,
    dto: EventRosterDto | RosterImportRowDto,
    actor: UserRow,
    teamId = dto instanceof Object && "teamId" in dto ? dto.teamId : undefined,
  ) {
    const mobile = clean(dto.mobile);
    if (!validMobile(mobile)) throw new ApiError(400, "Enter a valid 10-digit mobile number.");
    let source:
      | { name: string; familyId: string; membershipId: string | null; mobile: string | null; village: string | null; fatherName: string | null }
      | undefined;
    if (dto.memberId) {
      const member = await this.prisma.familyMember.findUnique({ where: { id: dto.memberId }, include: { family: true } });
      if (!member || member.status !== "ACTIVE" || !["ACTIVE", "APPROVED"].includes(member.family.status || ""))
        throw new ApiError(400, "Selected family member is not active.");
      source = {
        name: member.name,
        familyId: member.family.familyId || member.familyId,
        membershipId: member.membershipId,
        mobile: member.mobile,
        village: member.family.village,
        fatherName: member.family.headName,
      };
    }
    const memberName = (source?.name || dto.memberName || "").trim();
    if (!memberName) throw new ApiError(400, "Member name is required.");
    if (teamId && !(await this.prisma.eventTeam.findFirst({ where: { id: teamId, eventId, status: "ACTIVE" } })))
      throw new ApiError(400, "Team does not belong to this event.");
    return {
      eventId,
      memberId: dto.memberId || null,
      teamId: teamId || null,
      memberName,
      fatherName: source?.fatherName || clean(dto.fatherName),
      village: source?.village || clean(dto.village),
      mobile: source?.mobile || mobile,
      familyId: source?.familyId || clean(dto.familyId),
      membershipId: source?.membershipId || clean(dto.membershipId),
      committee: clean(dto.committee),
      responsibility: clean(dto.responsibility),
      status: "ACTIVE",
      createdById: actor.id,
      updatedById: actor.id,
    } satisfies Omit<Prisma.EventRosterUncheckedCreateInput, "id">;
  }

  async roster(eventId: string) {
    await this.assertEvent(eventId);
    const [members, teams, assignments] = await Promise.all([
      this.prisma.eventRoster.findMany({
        where: { eventId, deletedAt: null },
        include: { team: true, assignments: true },
        orderBy: [{ village: "asc" }, { memberName: "asc" }],
      }),
      this.prisma.eventTeam.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
      this.prisma.eventResponsibility.findMany({
        where: { eventId },
        include: { roster: { select: { memberName: true } }, team: { select: { name: true } } },
        orderBy: { deadline: "asc" },
      }),
    ]);
    return {
      members,
      teams,
      assignments,
      stats: {
        totalMembers: members.length,
        volunteers: members.filter((row) => !row.committee).length,
        committeeMembers: members.filter((row) => Boolean(row.committee || row.teamId)).length,
        assigned: assignments.length,
        pending: assignments.filter((row) => ["ASSIGNED", "IN_PROGRESS"].includes(row.status)).length,
        completed: assignments.filter((row) => row.status === "COMPLETED").length,
      },
    };
  }

  async saveRoster(eventId: string, dto: EventRosterDto, actor: UserRow, id?: string) {
    await this.assertEvent(eventId);
    const data = await this.rosterData(eventId, dto, actor, dto.teamId);
    return this.prisma.$transaction(async (tx) => {
      if (id) {
        const before = await tx.eventRoster.findFirst({ where: { id, eventId, deletedAt: null } });
        if (!before) throw new ApiError(404, "Roster member not found.");
        const after = await tx.eventRoster.update({ where: { id }, data: { ...data, createdById: undefined } });
        await this.audit(tx, eventId, actor.id, "ROSTER", id, "UPDATE", before, after);
        return after;
      }
      const duplicate = data.memberId
        ? await tx.eventRoster.findFirst({ where: { eventId, memberId: data.memberId, deletedAt: null } })
        : data.mobile
          ? await tx.eventRoster.findFirst({ where: { eventId, mobile: data.mobile, memberName: data.memberName, deletedAt: null } })
          : null;
      if (duplicate) throw new ApiError(409, "This member is already on the event roster.");
      const row = await tx.eventRoster.create({ data: { id: randomId(), ...data } });
      await this.audit(tx, eventId, actor.id, "ROSTER", row.id, "CREATE", null, row);
      return row;
    });
  }

  async deleteRoster(eventId: string, id: string, actor: UserRow) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.eventRoster.findFirst({ where: { id, eventId, deletedAt: null } });
      if (!before) throw new ApiError(404, "Roster member not found.");
      const after = await tx.eventRoster.update({ where: { id }, data: { status: "INACTIVE", deletedAt: new Date(), updatedById: actor.id } });
      await this.audit(tx, eventId, actor.id, "ROSTER", id, "DELETE", before, after);
    });
  }

  async saveTeam(eventId: string, dto: EventTeamDto, actor: UserRow, id?: string) {
    await this.assertEvent(eventId);
    const data = {
      name: dto.name.trim(),
      leaderName: clean(dto.leaderName),
      leaderMobile: clean(dto.leaderMobile),
      responsibilities: clean(dto.responsibilities),
      status: dto.status || "ACTIVE",
    };
    if (!data.name) throw new ApiError(400, "Team name is required.");
    if (!validMobile(dto.leaderMobile)) throw new ApiError(400, "Enter a valid team leader mobile number.");
    try {
      if (id) {
        const result = await this.prisma.eventTeam.updateMany({ where: { id, eventId }, data });
        if (!result.count) throw new ApiError(404, "Team not found.");
        return this.prisma.eventTeam.findUnique({ where: { id } });
      }
      return this.prisma.eventTeam.create({ data: { id: randomId(), eventId, createdById: actor.id, ...data } });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ApiError(409, "A team with that name already exists for this event.");
      throw error;
    }
  }

  async deactivateTeam(eventId: string, id: string) {
    const row = await this.prisma.eventTeam.updateMany({ where: { id, eventId }, data: { status: "INACTIVE" } });
    if (!row.count) throw new ApiError(404, "Team not found.");
  }

  async saveResponsibility(eventId: string, dto: EventResponsibilityDto, actor: UserRow, id?: string) {
    await this.assertEvent(eventId);
    const roster = await this.prisma.eventRoster.findFirst({ where: { id: dto.rosterId, eventId, deletedAt: null } });
    if (!roster) throw new ApiError(400, "Select an active roster member.");
    if (dto.teamId && !(await this.prisma.eventTeam.findFirst({ where: { id: dto.teamId, eventId, status: "ACTIVE" } })))
      throw new ApiError(400, "Team does not belong to this event.");
    const data: Omit<Prisma.EventResponsibilityUncheckedCreateInput, "id"> = {
      eventId,
      rosterId: dto.rosterId,
      teamId: dto.teamId || null,
      title: dto.title.trim(),
      description: clean(dto.description),
      assignedById: actor.id,
      startDate: parseDate(dto.startDate) || null,
      deadline: parseDate(dto.deadline) || null,
      priority: dto.priority || "MEDIUM",
      status: dto.status || "ASSIGNED",
      remarks: clean(dto.remarks),
    };
    if (!data.title) throw new ApiError(400, "Responsibility title is required.");
    if (data.startDate && data.deadline && data.deadline < data.startDate) throw new ApiError(400, "Deadline cannot be before the start date.");
    if (id) {
      const result = await this.prisma.eventResponsibility.updateMany({ where: { id, eventId }, data: { ...data, assignedById: undefined } });
      if (!result.count) throw new ApiError(404, "Assignment not found.");
      return this.prisma.eventResponsibility.findUnique({
        where: { id },
        include: { roster: { select: { memberName: true } }, team: { select: { name: true } } },
      });
    }
    return this.prisma.eventResponsibility.create({
      data: { ...data, id: randomId() },
      include: { roster: { select: { memberName: true } }, team: { select: { name: true } } },
    });
  }

  async importRoster(eventId: string, dto: RosterImportDto, actor: UserRow) {
    await this.assertEvent(eventId);
    const existing = await this.prisma.eventRoster.findMany({
      where: { eventId, deletedAt: null },
      select: { memberId: true, memberName: true, mobile: true },
    });
    const existingKeys = new Set(existing.map((row) => (row.memberId ? `id:${row.memberId}` : `${row.memberName.toLowerCase()}|${mobileDigits(row.mobile)}`)));
    const seen = new Set<string>();
    const errors: { row: number; message: string }[] = [];
    const validRows: { rowNumber: number; record: RosterImportRowDto }[] = [];
    for (const [index, row] of dto.records.entries()) {
      const rowNumber = index + 2;
      const name = row.memberName?.trim();
      if (!name && !row.memberId) {
        errors.push({ row: rowNumber, message: "Member name or registered member ID is required." });
        continue;
      }
      if (!validMobile(row.mobile)) {
        errors.push({ row: rowNumber, message: "Invalid mobile number; use 10 digits." });
        continue;
      }
      const key = row.memberId ? `id:${row.memberId}` : `${name!.toLowerCase()}|${mobileDigits(row.mobile)}`;
      if (seen.has(key) || existingKeys.has(key)) {
        errors.push({ row: rowNumber, message: "Duplicate roster member." });
        continue;
      }
      seen.add(key);
      validRows.push({ rowNumber, record: { ...row, memberName: name } });
    }
    const report = { errors, validCount: validRows.length, importedCount: 0 };
    if (!dto.confirm) return { preview: true, totalRows: dto.records.length, validRows: validRows.map(({ record }) => record), errors, importedCount: 0 };
    const inserted: Omit<Prisma.EventRosterUncheckedCreateInput, "id">[] = [];
    for (const { rowNumber, record } of validRows) {
      try {
        inserted.push(await this.rosterData(eventId, record, actor));
      } catch (error) {
        errors.push({ row: rowNumber, message: error instanceof Error ? error.message : "Invalid roster row." });
      }
    }
    report.errors = errors;
    report.importedCount = inserted.length;
    await this.prisma.$transaction(async (tx) => {
      const created = [];
      for (const row of inserted) created.push(await tx.eventRoster.create({ data: { ...row, id: randomId() } }));
      await tx.rosterImportHistory.create({
        data: {
          id: randomId(),
          eventId,
          fileName: dto.fileName,
          totalRows: dto.records.length,
          importedCount: inserted.length,
          failedCount: errors.length,
          report,
          createdById: actor.id,
        },
      });
      for (const row of created) await this.audit(tx, eventId, actor.id, "ROSTER", row.id, "IMPORT", null, row);
    });
    return { preview: false, totalRows: dto.records.length, importedCount: inserted.length, failedCount: errors.length, errors };
  }

  async availableMembers(query: string) {
    const search = query.trim();
    if (search.length < 2) return [];
    const members = await this.prisma.familyMember.findMany({
      where: {
        status: "ACTIVE",
        family: { status: { in: ["ACTIVE", "APPROVED"] } },
        OR: [{ name: { contains: search } }, { membershipId: { contains: search } }, { family: { village: { contains: search } } }],
      },
      include: { family: { select: { familyId: true, headName: true, village: true } } },
      take: 30,
      orderBy: { name: "asc" },
    });
    return members.map((member) => ({
      id: member.id,
      name: member.name,
      fatherName: member.family.headName,
      village: member.family.village,
      mobile: member.mobile,
      familyId: member.family.familyId || member.familyId,
      membershipId: member.membershipId,
    }));
  }
}
