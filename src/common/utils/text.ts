// Mobiles compare on their last 10 digits, whatever formatting was typed.
export const normalizeMobile = (value: unknown): string =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(-10);

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const blank = (value: unknown): boolean => !value || !String(value).trim();

// The stored digits of a mobile (the duplicate checks compare these), or null.
export const mobileDigits = (value: unknown): string | null => normalizeMobile(value) || null;

// A person's or family's name as stored: trimmed, with runs of spaces (or tabs/newlines) collapsed to one space,
// so "Sanjay  Patidar" is saved as "Sanjay Patidar" and the admin search for the name finds it.
export const normalizeName = (value: string): string => value.trim().replace(/\s+/g, " ");

// The name columns of applications, families, members, students and student applications.
const NAME_FIELDS = ["familyHeadName", "familyName", "headName", "name", "studentName", "guardianName", "fatherName", "motherName"];

// Data to save with its derived contact fields: the digits column follows the
// mobile field whenever that is written, emails are stored trimmed and names tidied (normalizeName).
export const withContactFields = <T extends object>(data: T, mobileField: string, digitsField: string): T => {
  const out = { ...data } as Record<string, unknown>;
  const mobile = out[mobileField];
  if (mobile === null || typeof mobile === "string") out[digitsField] = mobileDigits(mobile);
  if (typeof out.email === "string") out.email = out.email.trim();
  for (const field of NAME_FIELDS) {
    const value = out[field];
    if (typeof value === "string") out[field] = normalizeName(value);
  }
  return out as T;
};
