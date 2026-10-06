// Mobiles compare on their last 10 digits, whatever formatting was typed.
export const normalizeMobile = (value: unknown): string =>
  String(value ?? "")
    .replace(/\D/g, "")
    .slice(-10);

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const blank = (value: unknown): boolean => !value || !String(value).trim();
