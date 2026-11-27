import { randomId } from "../common/utils/crypto.js";
import type { Db } from "../database/prisma.service.js";
import { BLOOD_GROUPS, mobile10 } from "./blood-help.rules.js";

export interface RegistrationDonor {
  userId: string | null;
  bloodGroup: string | null;
  name: string;
  mobile: string | null;
  city: string | null;
}

// An approved family or student registration that gave a blood group puts the applicant on the Blood Donor list
// (Community Services → Blood Donor), available, with the name, mobile and city from the registration. Someone who is
// already a donor keeps their own entry untouched; they change their group or switch it off on the Become a Donor page.
// Returns true when a donor entry was added.
export async function addRegistrationDonor(db: Db, entry: RegistrationDonor): Promise<boolean> {
  const bloodGroup = entry.bloodGroup ?? "";
  if (!entry.userId || !(BLOOD_GROUPS as readonly string[]).includes(bloodGroup)) return false;
  const existing = await db.bloodDonor.findUnique({ where: { userId: entry.userId }, select: { id: true } });
  if (existing) return false;
  await db.bloodDonor.create({
    data: {
      id: randomId(),
      userId: entry.userId,
      bloodGroup,
      name: entry.name.replace(/\s+/g, " ").trim().slice(0, 150) || null,
      mobile: mobile10(entry.mobile),
      city: entry.city?.replace(/\s+/g, " ").trim().slice(0, 150) || null,
      available: true,
    },
  });
  return true;
}
