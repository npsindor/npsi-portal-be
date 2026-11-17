import crypto from "node:crypto";
import { randomId } from "../common/utils/crypto.js";
import type { Db } from "../database/prisma.service.js";

// Profiles that reached the admin (submitted at least once) get a card; drafts don't.
export const CARD_PROFILE_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "INACTIVE"] as const;

// Printed profile code: SB-<year>-<serial>, e.g. SB-2026-0007. The serial is unique across all years.
export const profileCodeOf = (serial: number, year: number) => `SB-${year}-${String(serial).padStart(4, "0")}`;
export const newVerifyToken = () => crypto.randomBytes(18).toString("base64url");

const isUniqueClash = (error: unknown) => (error as { code?: string }).code === "P2002";

// Creates the card for a profile if it has none. Two requests may pick the same serial at once; the unique index
// rejects one and it retries with the next number.
export async function ensureDigitalCard(db: Db, profileId: string, now = new Date()) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.sagunDigitalCard.findUnique({ where: { profileId } });
    if (existing) return existing;
    const last = await db.sagunDigitalCard.findFirst({ orderBy: { serial: "desc" }, select: { serial: true } });
    const serial = (last?.serial ?? 0) + 1;
    try {
      return await db.sagunDigitalCard.create({
        data: { id: randomId(), profileId, serial, profileCode: profileCodeOf(serial, now.getUTCFullYear()), verifyToken: newVerifyToken() },
      });
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
    }
  }
  throw new Error("SAGUN_CARD_SERIAL");
}

// Cards for submitted profiles that predate this feature (or whose creation failed after a submission).
export async function backfillDigitalCards(db: Db) {
  const missing = await db.sagunProfile.findMany({
    where: { status: { in: [...CARD_PROFILE_STATUSES] }, digitalCard: null },
    orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, submittedAt: true, createdAt: true },
    take: 1000,
  });
  for (const profile of missing) await ensureDigitalCard(db, profile.id, profile.submittedAt ?? profile.createdAt);
  return missing.length;
}
