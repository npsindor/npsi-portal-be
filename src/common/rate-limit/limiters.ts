import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

// Same limiter instances as the legacy app. Each instance keeps one counter per
// client IP shared by every route it is applied to (e.g. all auth routes share
// `authLimiter`), so modules must reuse these objects rather than create new ones.
export const TOO_MANY_REQUESTS = "Too many requests, please try again later.";
// The body is the API's usual `{ "error": … }` so clients can show it like any other error.
const limiter = (windowMs: number, limit: number): RateLimitRequestHandler =>
  rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: TOO_MANY_REQUESTS } });

// Brute-force/enumeration protection for login, OTP and password-reset flows.
export const authLimiter = limiter(15 * 60 * 1000, 20);
export const otpLimiter = limiter(10 * 60 * 1000, 10);
// Public lookups return real PII on a match (QR membership cards, application
// tracking); this keeps one-off lookups working while stopping bulk scraping.
export const publicLookupLimiter = limiter(15 * 60 * 1000, 30);
export const uploadLimiter = limiter(15 * 60 * 1000, 40);
// Public Sagun submissions are checked against account and family membership before any record is saved.
export const sagunSubmitLimiter = limiter(15 * 60 * 1000, 15);
// Upload endpoint is public (registration forms upload photos before an account
// exists), so on top of the 15-minute limit each IP gets a daily cap.
export const uploadDailyLimiter = limiter(24 * 60 * 60 * 1000, 150);
// Availability checks reveal whether an email/mobile is registered; generous
// enough for form typing, tight enough to stop bulk enumeration.
export const availabilityLimiter = limiter(15 * 60 * 1000, 60);
// Room Hunting: browsing re-queries on every filter change; posting listings, requirements and enquiries is rarer.
export const roomBrowseLimiter = limiter(15 * 60 * 1000, 150);
export const roomSubmitLimiter = limiter(15 * 60 * 1000, 15);
// Global search runs as the visitor types (debounced), so it gets its own, more generous counter.
export const searchLimiter = limiter(15 * 60 * 1000, 300);
// Logged-in members' feedback lands in the admin queue; this stops one account flooding it.
export const feedbackLimiter = limiter(15 * 60 * 1000, 10);
