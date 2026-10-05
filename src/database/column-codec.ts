// Converts between the API's column values and Prisma's types so the Prisma
// data layer behaves exactly like the legacy raw-SQL layer:
//  - out: DATE columns as "YYYY-MM-DD", DECIMAL(12,2) as "100.00", TINYINT
//    booleans as 1/0 (what MySQL returned before), everything else unchanged;
//  - in: the implicit conversions MySQL applied to the values the legacy code
//    sent ("5" into INT, 0/1 into TINYINT, "YYYY-MM-DD HH:MM:SS" into DATETIME,
//    JSON text into JSON). Values MySQL would have rejected are rejected with
//    the same kind of 500 error.
import { ApiError } from "../common/filters/api-error.js";
import type { ColumnKind } from "../entities/entity-definitions.js";
import { Prisma } from "../generated/prisma/client.js";
import type { DbRow } from "./database.types.js";

const DATETIME_TEXT = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?)?$/;
const DECIMAL_SCALE = 2;

const sqlError = (message: string): ApiError => new ApiError(500, message);
const describe = (value: unknown): string => (typeof value === "string" ? `'${value}'` : String(value));

// ---- out ----------------------------------------------------------------

export const toApiValue = (kind: ColumnKind | undefined, value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  switch (kind) {
    case "dd":
      return value instanceof Date ? value.toISOString().slice(0, 10) : value;
    case "d":
      return typeof value === "object" && "toFixed" in value ? (value as { toFixed(dp: number): string }).toFixed(DECIMAL_SCALE) : value;
    case "b":
      return typeof value === "boolean" ? (value ? 1 : 0) : value;
    default:
      return value;
  }
};

export const toApiRow = (columns: Record<string, ColumnKind>, row: DbRow): DbRow =>
  Object.fromEntries(Object.entries(row).map(([column, value]) => [column, toApiValue(columns[column], value)]));

// ---- in -----------------------------------------------------------------

const toDateTime = (column: string, value: unknown, dateOnly: boolean): Date => {
  const match = typeof value === "string" ? value.trim().match(DATETIME_TEXT) : null;
  if (!match) throw sqlError(`Incorrect ${dateOnly ? "date" : "datetime"} value: ${describe(value)} for column '${column}' at row 1`);
  const parsed = new Date(`${match[1]}T${dateOnly ? "00:00:00" : (match[2] ?? "00:00:00")}Z`);
  if (Number.isNaN(parsed.getTime())) throw sqlError(`Incorrect ${dateOnly ? "date" : "datetime"} value: ${describe(value)} for column '${column}' at row 1`);
  return parsed;
};

const toNumber = (column: string, value: unknown, kind: "integer" | "decimal"): number | string => {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return kind === "integer" ? Math.round(value) : value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return kind === "integer" ? Math.round(Number(value)) : value.trim();
  throw sqlError(`Incorrect ${kind} value: ${describe(value)} for column '${column}' at row 1`);
};

const toBoolean = (column: string, value: unknown): boolean => {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  throw sqlError(`Incorrect integer value: ${describe(value)} for column '${column}' at row 1`);
};

const toJson = (column: string, value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw sqlError(`Invalid JSON text: "Invalid value." at position 0 in value for column '${column}'.`);
  }
};

const toText = (value: unknown): string => {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

// `value` is what the legacy code would have bound into its SQL (see valueForSql).
export const toDbValue = (column: string, kind: ColumnKind | undefined, value: unknown): unknown => {
  // Prisma needs DbNull (SQL NULL) rather than null for nullable JSON columns.
  if (kind === "j" && value === null) return Prisma.DbNull;
  if (value === null || value === undefined) return value;
  switch (kind) {
    case "dt":
      return toDateTime(column, value, false);
    case "dd":
      return toDateTime(column, value, true);
    case "i":
      return toNumber(column, value, "integer");
    case "d":
      return toNumber(column, value, "decimal");
    case "b":
      return toBoolean(column, value);
    case "j":
      return toJson(column, value);
    default:
      return toText(value);
  }
};
