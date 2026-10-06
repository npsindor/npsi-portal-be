// The members listed on a family application (`membersData`), whatever shape
// older forms stored them in: an array, a JSON string, or { items | data: [...] }.
export interface ApplicationMember {
  name?: unknown;
  relationship?: unknown;
  gender?: unknown;
  dob?: unknown;
  mobile?: unknown;
  email?: unknown;
  education?: unknown;
  occupation?: unknown;
  address?: unknown;
  photoUrl?: unknown;
}

export const applicationMembers = (value: unknown): ApplicationMember[] => {
  if (typeof value === "string") {
    try {
      return applicationMembers(JSON.parse(value || "[]"));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.filter((entry): entry is ApplicationMember => !!entry && typeof entry === "object");
  if (!value || typeof value !== "object") return [];
  const { items, data } = value as { items?: unknown; data?: unknown };
  if (Array.isArray(items)) return applicationMembers(items);
  if (Array.isArray(data)) return applicationMembers(data);
  const entries = Object.values(value);
  return entries.length && entries.every((entry) => entry && typeof entry === "object") ? (entries as ApplicationMember[]) : [];
};

// Text fields as stored: trimmed, empty as null.
export const text = (value: unknown): string | null => (typeof value === "string" || typeof value === "number" ? String(value).trim() || null : null);

// A "YYYY-MM-DD" date of birth, or null.
export const dateOnly = (value: unknown): Date | null => {
  const match = typeof value === "string" ? value.trim().match(/^(\d{4}-\d{2}-\d{2})/) : null;
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
