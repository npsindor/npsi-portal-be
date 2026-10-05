import { Injectable } from "@nestjs/common";
import { ApiError } from "../common/filters/api-error.js";
import type { UserRow } from "../common/session/session.service.js";
import { quoteIdentifier, type RecordBody, toColumn, valueForSql } from "../common/utils/records.js";
import { toApiRow, toDbValue } from "../database/column-codec.js";
import type { DbRow } from "../database/database.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { type ColumnKind, ENTITY_DEFINITIONS, type EntityName } from "./entity-definitions.js";

// The generic entity API addresses models by name at runtime, so it needs a
// structural view of a Prisma model delegate. Arguments are built from the
// entity definitions (known columns only) and converted by the column codec.
interface ModelDelegate {
  findMany(args: object): Promise<DbRow[]>;
  findUnique(args: object): Promise<DbRow | null>;
  create(args: object): Promise<DbRow>;
  updateMany(args: object): Promise<{ count: number }>;
  deleteMany(args: object): Promise<{ count: number }>;
}

const BASE_COLUMNS: Record<string, ColumnKind> = { id: "s", created_at: "dt", updated_at: "dt" };
const columnsOf = (entity: EntityName): Record<string, ColumnKind> => ({ ...BASE_COLUMNS, ...ENTITY_DEFINITIONS[entity].columns });
const modelKey = (entity: EntityName): string => entity.charAt(0).toLowerCase() + entity.slice(1);
const unknownColumn = (column: string, clause: string): ApiError => new ApiError(500, `Unknown column '${column}' in '${clause}'`);

// Data access for the generic entity API via Prisma, matching the legacy SQL:
// exact-match filters on known columns, `column = NULL` matching nothing,
// MySQL's "Unknown column" errors for anything else, and MySQL-formatted values.
@Injectable()
export class EntitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private model(entity: EntityName): ModelDelegate {
    // Runtime lookup of `prisma.<entity>`; the entity name comes from code, never the client.
    return (this.prisma as unknown as Record<string, ModelDelegate>)[modelKey(entity)];
  }

  private toApi(entity: EntityName, row: DbRow | null): DbRow | undefined {
    return row ? toApiRow(columnsOf(entity), row) : undefined;
  }

  // `filter` comes straight from the client's ?filter= JSON. `recipientFamilyId`
  // scopes notifications to one family plus broadcasts (recipient NULL).
  async list(
    entity: EntityName,
    filter: RecordBody,
    recipientFamilyId: string | null,
    orderColumn: string,
    descending: boolean,
    limit: number,
  ): Promise<DbRow[]> {
    const columns = columnsOf(entity);
    const where: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(filter)) {
      const column = toColumn(field);
      if (!(column in columns)) throw unknownColumn(column, "where clause");
      const sqlValue = valueForSql(value);
      // SQL `column = NULL` is never true, so the legacy filter matched nothing.
      if (sqlValue === null || sqlValue === undefined) return [];
      const dbValue = toDbValue(column, columns[column], sqlValue);
      where[column] = columns[column] === "j" ? { equals: dbValue } : dbValue;
    }
    if (recipientFamilyId !== null) {
      where.AND = [{ OR: [{ recipient_family_id: recipientFamilyId }, { recipient_family_id: null }] }];
    }
    if (!(orderColumn in columns)) throw unknownColumn(orderColumn, "order clause");
    const rows = await this.model(entity).findMany({ where, orderBy: { [orderColumn]: descending ? "desc" : "asc" }, take: limit });
    return rows.map((row) => toApiRow(columns, row));
  }

  async findById(entity: EntityName, id: string): Promise<DbRow | undefined> {
    return this.toApi(entity, await this.model(entity).findUnique({ where: { id } }));
  }

  // `values` are what the legacy code bound into its INSERT (see valueForSql).
  async insert(entity: EntityName, columns: string[], values: unknown[]): Promise<void> {
    await this.model(entity).create({ data: this.toData(entity, columns, values) });
  }

  async update(entity: EntityName, columns: string[], values: unknown[], id: string): Promise<void> {
    await this.model(entity).updateMany({ where: { id }, data: { ...this.toData(entity, columns, values), updated_at: new Date() } });
  }

  async delete(entity: EntityName, id: string): Promise<void> {
    await this.model(entity).deleteMany({ where: { id } });
  }

  private toData(entity: EntityName, columns: string[], values: unknown[]): Record<string, unknown> {
    const known = columnsOf(entity);
    return Object.fromEntries(
      columns.map((column, i) => {
        if (!(column in known)) throw unknownColumn(column, "field list");
        return [column, toDbValue(column, known[column], values[i])];
      }),
    );
  }

  // Next display id like NPSI-FAM-000123: highest numeric suffix + 1.
  async nextSequentialId(entity: EntityName, column: string, prefix: string): Promise<string> {
    const table = Prisma.raw(quoteIdentifier(ENTITY_DEFINITIONS[entity].table));
    const col = Prisma.raw(quoteIdentifier(column));
    const [row] = await this.prisma.$queryRaw<{ maxNum: bigint | number | string | null }[]>(
      Prisma.sql`SELECT MAX(CAST(SUBSTRING(${col}, ${prefix.length + 1}) AS UNSIGNED)) AS maxNum FROM ${table} WHERE ${col} LIKE ${`${prefix}%`}`,
    );
    return `${prefix}${String(Number(row?.maxNum ?? 0) + 1).padStart(6, "0")}`;
  }

  // The family (display id) a user belongs to: an ACTIVE family registered
  // with their email, else the family of a member with their email.
  async ownFamilyId(user: UserRow | null): Promise<string | null> {
    if (!user?.email) return null;
    const family = await this.prisma.family.findFirst({ where: { email: user.email, status: "ACTIVE" }, select: { family_id: true } });
    if (family?.family_id) return family.family_id;
    const member = await this.prisma.familyMember.findFirst({ where: { email: user.email }, select: { family_id: true } });
    return member ? member.family_id : null;
  }

  async familyIdOfFamilyRow(id: string): Promise<{ family_id: string | null } | undefined> {
    return (await this.prisma.family.findUnique({ where: { id }, select: { family_id: true } })) ?? undefined;
  }

  async familyIdOfMemberRow(id: string): Promise<{ family_id: string } | undefined> {
    return (await this.prisma.familyMember.findUnique({ where: { id }, select: { family_id: true } })) ?? undefined;
  }

  async familyIdOfMembership(membershipId: unknown): Promise<{ family_id: string } | undefined> {
    if (membershipId === null || membershipId === undefined) return undefined;
    return (await this.prisma.familyMember.findFirst({ where: { membership_id: String(membershipId) }, select: { family_id: true } })) ?? undefined;
  }

  memberIdsOfFamily(familyId: string): Promise<{ id: string }[]> {
    return this.prisma.familyMember.findMany({ where: { family_id: familyId }, select: { id: true } });
  }

  // Fee in the legacy format ("100.00"), as the fee calculation always received it.
  async eventFee(eventId: unknown): Promise<{ fee: unknown } | undefined> {
    if (eventId === null || eventId === undefined) return undefined;
    const event = await this.prisma.event.findUnique({ where: { id: String(eventId) }, select: { fee: true } });
    return event ? (toApiRow(ENTITY_DEFINITIONS.Event.columns, event) as { fee: unknown }) : undefined;
  }

  async studentForTransfer(studentId: unknown): Promise<{ email: string | null; linked_family_id: string | null } | undefined> {
    if (studentId === null || studentId === undefined) return undefined;
    return (await this.prisma.student.findFirst({ where: { student_id: String(studentId) }, select: { email: true, linked_family_id: true } })) ?? undefined;
  }

  async notificationRecipient(id: string): Promise<{ recipient_family_id: string | null } | undefined> {
    return (await this.prisma.notification.findUnique({ where: { id }, select: { recipient_family_id: true } })) ?? undefined;
  }
}
