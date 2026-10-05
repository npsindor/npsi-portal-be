import { Injectable } from "@nestjs/common";
import { DatabaseService, type DbRow } from "../../database/database.service.js";

type ContactRow = { id?: string; status?: string; mobile?: unknown; email?: unknown; contact_number?: unknown };

// SQL behind the public lookup endpoints and the duplicate-contact checks,
// unchanged from the legacy app.
@Injectable()
export class LookupsRepository {
  constructor(private readonly db: DatabaseService) {}

  publicFamily(familyId: string): Promise<DbRow | undefined> {
    return this.db.first("SELECT family_id, family_name, head_name, status, city, registration_date FROM families WHERE family_id = ? LIMIT 1", [familyId]);
  }

  publicMembers(familyId: string): Promise<DbRow[]> {
    return this.db.rows("SELECT name, relationship, gender, status FROM family_members WHERE family_id = ? ORDER BY created_at ASC", [familyId]);
  }

  application(applicationId: string, mobile: string): Promise<DbRow | undefined> {
    return this.db.first("SELECT * FROM applications WHERE application_id = ? AND mobile = ? LIMIT 1", [applicationId, mobile]);
  }

  async activeCounts(): Promise<{ families: unknown; members: unknown }> {
    const [[families], [members]] = await Promise.all([
      this.db.rows<{ count: unknown }>("SELECT COUNT(*) AS count FROM families WHERE status = 'ACTIVE'"),
      this.db.rows<{ count: unknown }>("SELECT COUNT(*) AS count FROM family_members WHERE status = 'ACTIVE'"),
    ]);
    return { families: families.count, members: members.count };
  }

  // Contacts considered by the public mobile-availability check.
  mobileCheckSources(): Promise<[ContactRow[], ContactRow[], ContactRow[], ContactRow[], ContactRow[]]> {
    return Promise.all([
      this.db.rows<ContactRow>("SELECT mobile, status FROM applications"),
      this.db.rows<ContactRow>("SELECT contact_number FROM families"),
      this.db.rows<ContactRow>("SELECT mobile FROM family_members"),
      this.db.rows<ContactRow>("SELECT mobile, status FROM student_applications"),
      this.db.rows<ContactRow>("SELECT mobile FROM students"),
    ]);
  }

  // Contacts considered when a new application claims a mobile number.
  mobileTakenSources(): Promise<[ContactRow[], ContactRow[], ContactRow[]]> {
    return Promise.all([
      this.db.rows<ContactRow>("SELECT id, mobile, status FROM applications"),
      this.db.rows<ContactRow>("SELECT contact_number FROM families"),
      this.db.rows<ContactRow>("SELECT mobile FROM family_members"),
    ]);
  }

  emailTakenSources(): Promise<[ContactRow[], ContactRow[], ContactRow[], ContactRow[], ContactRow[], ContactRow[]]> {
    return Promise.all([
      this.db.rows<ContactRow>("SELECT id, email, status FROM applications"),
      this.db.rows<ContactRow>("SELECT email FROM families"),
      this.db.rows<ContactRow>("SELECT email FROM family_members"),
      this.db.rows<ContactRow>("SELECT id, email, status FROM student_applications"),
      this.db.rows<ContactRow>("SELECT email FROM students"),
      this.db.rows<ContactRow>("SELECT email FROM users"),
    ]);
  }
}
