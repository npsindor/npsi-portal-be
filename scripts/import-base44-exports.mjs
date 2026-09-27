import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";
import mysql from "mysql2/promise";

const folder = process.argv[2] || "database";
const entities = [["Announcement", "announcements"], ["Rule", "rules"], ["Event", "events"], ["Application", "applications"], ["Family", "families"], ["FamilyMember", "family_members"], ["StudentApplication", "student_applications"], ["Student", "students"], ["Transaction", "transactions"], ["Notification", "notifications"], ["Samiti", "samitis"], ["SamitiMember", "samiti_members"], ["Feedback", "feedback"], ["TransferRequest", "transfer_requests"]];
const metadata = new Set(["created_by_id", "is_sample"]); const jsonFields = new Set(["members_data", "member_ids", "member_names", "questions"]); const booleanFields = new Set(["read", "archived"]); const dateOnlyFields = new Set(["Event.date", "FamilyMember.dob", "Student.dob", "StudentApplication.dob", "Samiti.formed_date"]);
const toColumn = (header) => ({ created_date: "created_at", updated_date: "updated_at" }[header] || header);
const valueFor = (entity, field, value) => { if (value === undefined || value === "") return null; if (jsonFields.has(field)) return JSON.stringify(JSON.parse(value)); if (booleanFields.has(field)) return value.toLowerCase() === "true"; if (dateOnlyFields.has(`${entity}.${field}`)) return value.slice(0, 10); return value; };
const quote = (value) => `\`${value.replaceAll("`", "``")}\``;
const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST || "localhost", port: Number(process.env.MYSQL_PORT || 3600), user: process.env.MYSQL_USER || "cdn", password: process.env.MYSQL_PASSWORD || "cdn12345", database: process.env.MYSQL_DATABASE || "patidar_samaj" });
try {
  for (const [entity, table] of entities) {
    const text = await fs.readFile(path.join(folder, `${entity}_export.csv`), "utf8").catch(() => ""); if (!text.trim()) { console.log(`${entity}: skipped (empty or missing)`); continue; }
    const records = parse(text, { columns: true, skip_empty_lines: true, bom: true, relax_quotes: true }); const [columnRows] = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?", [table]); const columns = new Set(columnRows.map((row) => row.COLUMN_NAME || row.column_name));
    await connection.beginTransaction();
    for (const source of records) { const record = {}; for (const [header, raw] of Object.entries(source)) { const field = toColumn(header); if (metadata.has(header) || !columns.has(field)) continue; record[field] = valueFor(entity, field, raw); } const fields = Object.keys(record); const updates = fields.filter((field) => field !== "id" && field !== "updated_at").map((field) => `${quote(field)} = VALUES(${quote(field)})`); await connection.execute(`INSERT INTO ${quote(table)} (${fields.map(quote).join(", ")}) VALUES (${fields.map(() => "?").join(", ")}) ON DUPLICATE KEY UPDATE ${updates.join(", ")}, updated_at = NOW()`, fields.map((field) => record[field])); }
    await connection.commit(); console.log(`${entity}: imported ${records.length} record(s)`);
  }
} catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { await connection.end(); }