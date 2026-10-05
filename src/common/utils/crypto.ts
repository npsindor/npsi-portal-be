// Password, token and OTP helpers ported unchanged from the legacy server.
// Passwords are scrypt hashes stored as "salt:hash" (hex).
import crypto from "node:crypto";

const passwordKey = (password: string, salt: string): string => crypto.scryptSync(password, salt, 64).toString("hex");

export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${passwordKey(password, salt)}`;
};

export const verifyPassword = (password: string, stored: unknown): boolean => {
  if (typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(passwordKey(password, salt), "hex");
  const actual = Buffer.from(hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

export const createToken = (): string => crypto.randomBytes(32).toString("hex");
export const generateOtp = (): string => String(crypto.randomInt(0, 1000000)).padStart(6, "0");
export const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
export const hashOtp = (code: string): string => sha256(String(code));
export const randomId = (): string => crypto.randomUUID();
export const randomInvitePassword = (): string => `NPS@${crypto.randomBytes(6).toString("base64url")}!`;

export const safeEqual = (a: unknown, b: unknown): boolean => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};
