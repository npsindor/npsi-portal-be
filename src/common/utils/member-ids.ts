// Member ids carry their family's number: family NPSI-FAM-000001 → members NPSI-MEB-00000101 (the head),
// NPSI-MEB-00000102, … (prefix + the family's 6-digit number + the member's 2-digit place in the family).
// A family id without a number (old hand-made ids) keeps the old global sequence NPSI-MEM-000123.
export const MEMBER_ID_PREFIX = "NPSI-MEB-";
export const LEGACY_MEMBER_PREFIX = "NPSI-MEM-";
const FAMILY_WIDTH = 6;
const SERIAL_WIDTH = 2;
const LEGACY_WIDTH = 6;

export const familyNumber = (familyId: string | null | undefined): string | null => {
  const digits = /(\d+)$/.exec(String(familyId ?? ""))?.[1];
  return digits ? String(Number(digits)).padStart(FAMILY_WIDTH, "0") : null;
};

// The part every member id of this family starts with.
export const memberIdPrefix = (familyId: string | null | undefined): string => {
  const number = familyNumber(familyId);
  return number ? `${MEMBER_ID_PREFIX}${number}` : LEGACY_MEMBER_PREFIX;
};

// The next `count` member ids of a family, after the highest one among `existing` (ids starting with its prefix).
export const nextMemberIds = (familyId: string | null | undefined, existing: (string | null)[], count = 1): string[] => {
  const prefix = memberIdPrefix(familyId);
  const width = prefix === LEGACY_MEMBER_PREFIX ? LEGACY_WIDTH : SERIAL_WIDTH;
  const serials = existing
    .map((id) => (id?.startsWith(prefix) ? id.slice(prefix.length) : ""))
    .filter((suffix) => /^\d+$/.test(suffix))
    .map(Number);
  const first = Math.max(0, ...serials) + 1;
  return Array.from({ length: count }, (_, index) => `${prefix}${String(first + index).padStart(width, "0")}`);
};

export const isHeadRelationship = (relationship: unknown): boolean =>
  ["head", "self"].includes(
    String(relationship ?? "")
      .trim()
      .toLowerCase(),
  );
