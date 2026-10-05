import { Injectable } from "@nestjs/common";
import { DatabaseService, type DbRow } from "../../database/database.service.js";

// SQL behind the "my family" and "my feedback" endpoints, unchanged from the legacy app.
@Injectable()
export class MeRepository {
  constructor(private readonly db: DatabaseService) {}

  activeFamilyByEmail(email: string): Promise<DbRow | undefined> {
    return this.db.first("SELECT * FROM families WHERE LOWER(email) = LOWER(?) AND status = 'ACTIVE' LIMIT 1", [email]);
  }

  memberFamilyIdByEmail(email: string): Promise<{ family_id: string } | undefined> {
    return this.db.first("SELECT family_id FROM family_members WHERE LOWER(email) = LOWER(?) LIMIT 1", [email]);
  }

  familyByFamilyId(familyId: string): Promise<DbRow | undefined> {
    return this.db.first("SELECT * FROM families WHERE family_id = ? LIMIT 1", [familyId]);
  }

  membersOfFamily(familyId: unknown): Promise<DbRow[]> {
    return this.db.rows("SELECT * FROM family_members WHERE family_id = ? ORDER BY created_at ASC", [familyId]);
  }

  studentByEmail(email: string): Promise<DbRow | undefined> {
    return this.db.first("SELECT * FROM students WHERE LOWER(email) = LOWER(?) AND status != 'TRANSFERRED' LIMIT 1", [email]);
  }

  feedbackByEmail(email: string): Promise<DbRow[]> {
    return this.db.rows("SELECT * FROM feedback WHERE LOWER(email) = LOWER(?) ORDER BY created_at DESC LIMIT 100", [email]);
  }
}
