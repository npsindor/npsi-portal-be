// Mobiles compare on their last 10 digits, whatever formatting was typed.
export const normalizeMobile = (value: unknown): string =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(-10);

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const blank = (value: unknown): boolean => !value || !String(value).trim();

// The stored digits of a mobile (the duplicate checks compare these), or null.
export const mobileDigits = (value: unknown): string | null => normalizeMobile(value) || null;

// Data to save with its derived contact fields: the digits column follows the
// mobile field whenever that is written, and emails are stored trimmed.
export const withContactFields = <T extends object>(data: T, mobileField: string, digitsField: string): T => {
  const out = { ...data } as Record<string, unknown>;
  const mobile = out[mobileField];
  if (mobile === null || typeof mobile === "string") out[digitsField] = mobileDigits(mobile);
  if (typeof out.email === "string") out.email = out.email.trim();
  return out as T;
};
