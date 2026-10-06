// Request dates are ISO 8601 strings. A date-time without a zone ("2026-01-31
// 10:00:00") is UTC, like everything the database stores.
export function parseDate(value: string): Date;
export function parseDate(value: string | undefined): Date | undefined;
export function parseDate(value: string | null | undefined): Date | null | undefined;
export function parseDate(value: string | null | undefined): Date | null | undefined {
  if (value === null || value === undefined) return value;
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)) return new Date(text);
  return new Date(`${text.replace(" ", "T")}Z`);
}

// DATE columns go out as "YYYY-MM-DD" (no time, no zone).
export function toDateOnly(value: Date): string;
export function toDateOnly(value: Date | null): string | null;
export function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
