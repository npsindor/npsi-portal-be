import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

// Same limiter instances as the legacy app. Each instance keeps one counter per
// client IP shared by every route it is applied to (e.g. all auth routes share
// `authLimiter`), so modules must reuse these objects rather than create new ones.
const limiter = (windowMs: number, limit: number): RateLimitRequestHandler => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false });

// Brute-force/enumeration protection for login, OTP and password-reset flows.
export const authLimiter = limiter(15 * 60 * 1000, 20);
export const otpLimiter = limiter(10 * 60 * 1000, 10);
// Public lookups return real PII on a match (QR membership cards, application
// tracking); this keeps one-off lookups working while stopping bulk scraping.
export const publicLookupLimiter = limiter(15 * 60 * 1000, 30);
export const uploadLimiter = limiter(15 * 60 * 1000, 40);
