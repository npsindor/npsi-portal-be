import type { Db } from "../../database/prisma.service.js";
import type { UserRow } from "../session/session.service.js";

// The admin work the super admin can hand to a registered member (Admin → Assign roles). Each area opens only the
// API routes of its admin page, read + approve; creating, editing and deleting stay with the super admin.
export const ADMIN_AREAS = ["REGISTRATIONS", "STUDENT_REGISTRATIONS", "PAYMENTS", "FAMILIES"] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

// What the current account may do in the admin portal. superAdmin: everything, every village.
export interface AdminScope {
  superAdmin: boolean;
  areas: AdminArea[];
  allVillages: boolean;
  villages: string[];
}

export const SUPER_ADMIN_SCOPE: AdminScope = { superAdmin: true, areas: [...ADMIN_AREAS], allVillages: true, villages: [] };
export const OUTSIDE_VILLAGES = "This record belongs to a village outside your admin access.";

const key = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];

// null: no admin access at all. A staff account must still be an active, verified login.
export async function adminScopeOf(db: Db, user: UserRow | null): Promise<AdminScope | null> {
  if (!user) return null;
  if (user.role === "admin") return SUPER_ADMIN_SCOPE;
  if (user.status !== "active" || !user.isVerified) return null;
  const row = await db.adminAccess.findUnique({ where: { userId: user.id } });
  if (!row?.active) return null;
  const areas = strings(row.areas).filter((area): area is AdminArea => (ADMIN_AREAS as readonly string[]).includes(area));
  if (!areas.length) return null;
  return { superAdmin: false, areas, allVillages: row.allVillages, villages: strings(row.villages) };
}

// Whether a record's village (any of the given names, e.g. village and native place) is inside the scope.
export const villageAllowed = (scope: AdminScope, ...names: (string | null | undefined)[]): boolean =>
  scope.allVillages || names.some((name) => key(name) !== "" && scope.villages.some((village) => key(village) === key(name)));

// A Prisma filter for records whose village fields match the scope, case- and spacing-tolerant for the common
// spellings (the stored value, lower case, Title Case, UPPER CASE; trailing spaces already compare equal in these PAD SPACE collations). undefined: no filter (all villages).
export const villageWhere = (scope: AdminScope, fields: string[]): Record<string, unknown> | undefined => {
  if (scope.allVillages) return undefined;
  const title = (value: string) => value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  const names = [...new Set(scope.villages.flatMap((village) => [village.trim(), key(village), title(key(village)), key(village).toUpperCase()]))];
  if (!names.length) return { id: "__none__" };
  return { OR: fields.map((field) => ({ [field]: { in: names } })) };
};
