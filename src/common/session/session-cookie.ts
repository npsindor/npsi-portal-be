import type { Request, Response } from "express";
import { sessionTtl } from "../../auth/users.repository.js";

// The session token travels in an httpOnly cookie, out of reach of page
// scripts. SameSite=Strict: the frontend (npsindore.org) and the API
// (api.npsindore.org) are the same site, so the browser sends it to the API
// but never on requests started by another site. Secure outside development.
export const SESSION_COOKIE = "npsi_session";

const options = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "strict" as const, path: "/" });

// The cookie lives as long as the session can (shorter for administrators).
export const setSessionCookie = (response: Response, token: string, secure: boolean, role?: string | null): void => {
  response.cookie(SESSION_COOKIE, token, { ...options(secure), maxAge: sessionTtl(role) });
};

export const clearSessionCookie = (response: Response, secure: boolean): void => {
  response.clearCookie(SESSION_COOKIE, options(secure));
};

// The session cookie's value, if the request carries one.
export const cookieToken = (request: Request): string | undefined => {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE && value.length) return decodeURIComponent(value.join("="));
  }
  return undefined;
};
