import type { Request, Response } from "express";
import { SESSION_TTL } from "../../auth/users.repository.js";

// The session token travels in an httpOnly cookie, out of reach of page
// scripts. SameSite=Strict: the frontend (npsindore.org) and the API
// (api.npsindore.org) are the same site, so the browser sends it to the API
// but never on requests started by another site. Secure outside development.
export const SESSION_COOKIE = "npsi_session";

const options = (secure: boolean) => ({ httpOnly: true, secure, sameSite: "strict" as const, path: "/" });

export const setSessionCookie = (response: Response, token: string, secure: boolean): void => {
  response.cookie(SESSION_COOKIE, token, { ...options(secure), maxAge: SESSION_TTL });
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
