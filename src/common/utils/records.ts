// Record and SQL helpers ported unchanged from the legacy server/index.js.
import type { DbRow } from "../../database/database.service.js";

export type RecordBody = Record<string, unknown>;

export const quoteIdentifier = (value: string): string => `\`${value.replaceAll("`", "``")}\``;

export const normalizeMobile = (value: unknown): string =>
  String(value || "")
    .replace(/\D/g, "")
    .slice(-10);

export const toMoneyNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

export const toMySqlDateTime = (value: unknown): unknown => {
  if (value == null || value === "") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 19).replace("T", " ");
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (!/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(trimmed)) return value;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 19).replace("T", " ");
};

const DATE_FIELD_PATTERN = /^(dob|date|.*_date|.*_at|registration_open|registration_close)$/i;

export const sanitizeDateValues = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) return value.map((entry) => sanitizeDateValues(entry, key));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, sanitizeDateValues(entry, entryKey)]));
  }
  if (typeof value === "string") {
    if (DATE_FIELD_PATTERN.test(key || "") && !value.trim()) return null;
    return toMySqlDateTime(value);
  }
  return value;
};

export const valueForSql = (value: unknown): unknown => {
  if (value && typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
  return toMySqlDateTime(value);
};

export const toColumn = (field: string): string => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export const parseJsonIfNeeded = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
};

// API shape of a DB row: created_at/updated_at renamed, JSON strings parsed.
export const toRecord = (row: DbRow): RecordBody =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key === "created_at" ? "created_date" : key === "updated_at" ? "updated_date" : key, parseJsonIfNeeded(value)]),
  );

export const allowedFields = (record: RecordBody): string[] =>
  Object.keys(record).filter((field) => !["id", "createdAt", "updatedAt", "created_date", "updated_date"].includes(field));

// Legitimate form input never needs angle brackets; rejecting them stops
// HTML/script injection at the point of entry (non-admin writes only).
const MARKUP_PATTERN = /[<>]/;
export const findMarkupField = (record: RecordBody): string | null =>
  Object.entries(record).find(([, value]) => typeof value === "string" && MARKUP_PATTERN.test(value))?.[0] || null;

export const buildWhere = (filter: RecordBody = {}, values: unknown[] = []): string => {
  const entries = Object.entries(filter);
  if (!entries.length) return "";
  return ` WHERE ${entries
    .map(([field, value]) => {
      values.push(valueForSql(value));
      return `${quoteIdentifier(toColumn(field))} = ?`;
    })
    .join(" AND ")}`;
};
