import { Injectable } from "@nestjs/common";
import type { UserRow } from "../../common/session/session.service.js";
import { quoteIdentifier } from "../../common/utils/records.js";
import { DatabaseService, type DbRow } from "../../database/database.service.js";

// SQL for the generic entity API, unchanged from the legacy router. Table and
// column names always come from the entity definitions (never from the
// client) and are quoted; values are positional replacements.
@Injectable()
export class EntitiesRepository {
  constructor(private readonly db: DatabaseService) {}

  list(table: string, where: string, values: unknown[], orderColumn: string, descending: boolean): Promise<DbRow[]> {
    return this.db.rows(
      `SELECT * FROM ${quoteIdentifier(table)}${where} ORDER BY ${quoteIdentifier(orderColumn)} ${descending ? "DESC" : "ASC"} LIMIT ?`,
      values,
    );
  }

  findById(table: string, id: string): Promise<DbRow | undefined> {
    return this.db.first(`SELECT * FROM ${quoteIdentifier(table)} WHERE id = ?`, [id]);
  }

  async insert(table: string, columns: string[], values: unknown[]): Promise<void> {
    await this.db.execute(
      `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      values,
    );
  }

  async update(table: string, columns: string[], values: unknown[], id: string): Promise<void> {
    await this.db.execute(
      `UPDATE ${quoteIdentifier(table)} SET ${columns.map((column) => `${quoteIdentifier(column)} = ?`).join(", ")}, updated_at = NOW() WHERE id = ?`,
      [...values, id],
    );
  }

  async delete(table: string, id: string): Promise<void> {
    await this.db.execute(`DELETE FROM ${quoteIdentifier(table)} WHERE id = ?`, [id]);
  }

  // Next display id like NPSI-FAM-000123: highest numeric suffix + 1.
  async nextSequentialId(table: string, column: string, prefix: string): Promise<string> {
    const row = await this.db.first<{ maxNum: number | null }>(
      `SELECT MAX(CAST(SUBSTRING(${quoteIdentifier(column)}, ?) AS UNSIGNED)) AS maxNum FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} LIKE ?`,
      [prefix.length + 1, `${prefix}%`],
    );
    return `${prefix}${String((row?.maxNum || 0) + 1).padStart(6, "0")}`;
  }

  // The family (display id) a user belongs to: an ACTIVE family registered
  // with their email, else the family of a member with their email.
  async ownFamilyId(user: UserRow | null): Promise<string | null> {
    if (!user?.email) return null;
    const family = await this.db.first<{ family_id: string }>("SELECT family_id FROM families WHERE LOWER(email) = LOWER(?) AND status = 'ACTIVE' LIMIT 1", [
      user.email,
    ]);
    if (family) return family.family_id;
    const member = await this.db.first<{ family_id: string }>("SELECT family_id FROM family_members WHERE LOWER(email) = LOWER(?) LIMIT 1", [user.email]);
    return member ? member.family_id : null;
  }

  familyIdOfFamilyRow(id: string): Promise<{ family_id: string } | undefined> {
    return this.db.first("SELECT family_id FROM families WHERE id = ?", [id]);
  }

  familyIdOfMemberRow(id: string): Promise<{ family_id: string } | undefined> {
    return this.db.first("SELECT family_id FROM family_members WHERE id = ?", [id]);
  }

  familyIdOfMembership(membershipId: unknown): Promise<{ family_id: string } | undefined> {
    return this.db.first("SELECT family_id FROM family_members WHERE membership_id = ?", [membershipId]);
  }

  memberIdsOfFamily(familyId: string): Promise<{ id: string }[]> {
    return this.db.rows("SELECT id FROM family_members WHERE family_id = ?", [familyId]);
  }

  eventFee(eventId: unknown): Promise<{ fee: unknown } | undefined> {
    return this.db.first("SELECT fee FROM events WHERE id = ?", [eventId]);
  }

  studentForTransfer(studentId: unknown): Promise<{ email: string | null; linked_family_id: string | null } | undefined> {
    return this.db.first("SELECT email, linked_family_id FROM students WHERE student_id = ?", [studentId]);
  }

  notificationRecipient(id: string): Promise<{ recipient_family_id: string | null } | undefined> {
    return this.db.first("SELECT recipient_family_id FROM notifications WHERE id = ?", [id]);
  }
}
