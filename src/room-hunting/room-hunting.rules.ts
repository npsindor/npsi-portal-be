// Room Hunting rules shared by the service and its tests: option lists, normalisation, matching and privacy.

// Built-in property types (English is the stored value, Hindi is shown). Users may also type their own.
export const PROPERTY_TYPES: [string, string][] = [
  ["Single Room", "सिंगल रूम"],
  ["Shared Room", "शेयर्ड रूम"],
  ["1 BHK", "1 बीएचके"],
  ["2 BHK", "2 बीएचके"],
  ["3 BHK", "3 बीएचके"],
  ["Flat", "फ्लैट"],
  ["Apartment", "अपार्टमेंट"],
  ["Row House", "रो हाउस"],
  ["Independent House", "स्वतंत्र मकान"],
  ["Hostel / PG", "हॉस्टल / पीजी"],
  ["Other", "अन्य"],
];
// Initial coverage: Indore, Rau and Pithampur. Admin → Address options (Room hunting areas) adds more.
export const RENTAL_AREAS: [string, string][] = [
  ["Rajendra Nagar", "राजेंद्र नगर"],
  ["Sukhliya", "सुखलिया"],
  ["Vijay Nagar", "विजय नगर"],
  ["VIP Paraspar Nagar", "वीआईपी परस्पर नगर"],
  ["Bangali Square", "बंगाली चौराहा"],
  ["Vaibhav Nagar", "वैभव नगर"],
  ["Satellite Township", "सैटेलाइट टाउनशिप"],
  ["Bijalpur", "बिजलपुर"],
  ["Silicon City", "सिलिकॉन सिटी"],
  ["Star City", "स्टार सिटी"],
  ["Rau", "राऊ"],
  ["Pithampur", "पीथमपुर"],
];
export const TENANT_TYPES = ["FAMILY", "STUDENT", "ANY"] as const;
export const LISTING_STATUSES = ["PENDING", "APPROVED", "REJECTED", "RENTED", "INACTIVE", "EXPIRED", "ARCHIVED"] as const;
export const REQUIREMENT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CLOSED", "EXPIRED", "ARCHIVED"] as const;
export const LISTING_DAYS = 90;
export const REQUIREMENT_DAYS = 60;
export const MAX_RENT = 1_000_000;
export const MAX_LISTING_PHOTOS = 6;

// A listing's photographs: the stored list, or the single older photo_url; never duplicates or non-strings.
export const listingPhotos = (photoUrl: string | null, photoUrls: unknown): string[] => {
  const list = Array.isArray(photoUrls) ? photoUrls.filter((url): url is string => typeof url === "string" && url.length > 0) : [];
  return [...new Set(list.length ? list : photoUrl ? [photoUrl] : [])];
};

// "1-BHK", "1 bhk" and "1BHK" are the same type; "Vijay  Nagar" and "vijay nagar" the same area.
export const normalKey = (value: string): string =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

// Types that can stand in for one another when nothing exact is available.
const GROUPS = [
  ["singleroom", "sharedroom", "hostelpg", "room"],
  ["1bhk", "flat", "apartment"],
  ["2bhk", "3bhk", "flat", "apartment"],
  ["rowhouse", "independenthouse", "3bhk"],
];
export const typesRelated = (a: string, b: string): boolean => GROUPS.some((group) => group.includes(a) && group.includes(b));

export interface MatchListing {
  typeKey: string;
  areaKey: string;
  rentAmount: number;
  availableFor: string;
}
export interface MatchRequirement {
  typeKey: string;
  areaKey: string;
  maxBudget: number;
  minBudget?: number | null;
  tenantType: string;
}

// 0 = not a match. Exact type and area count most; the rent must be within budget (up to 10% over is a weak match).
// A listing for families only is not offered to a student requirement and vice versa.
export const matchScore = (requirement: MatchRequirement, listing: MatchListing): number => {
  if (listing.availableFor !== "ANY" && requirement.tenantType !== "ANY" && listing.availableFor !== requirement.tenantType) return 0;
  const exactType = requirement.typeKey === listing.typeKey;
  if (!exactType && !typesRelated(requirement.typeKey, listing.typeKey)) return 0;
  if (listing.rentAmount > requirement.maxBudget * 1.1) return 0;
  let score = exactType ? 40 : 15;
  score += requirement.areaKey === listing.areaKey ? 40 : 0;
  score += listing.rentAmount <= requirement.maxBudget ? 20 : 5;
  return score;
};
// Owners are told only about strong matches (exact or related type, same area, within budget), never about every request.
export const notifiable = (requirement: MatchRequirement, listing: MatchListing): boolean =>
  matchScore(requirement, listing) > 0 && requirement.areaKey === listing.areaKey && listing.rentAmount <= requirement.maxBudget;

export const mobile10 = (value: string): string | null => {
  const digits = String(value || "")
    .replace(/[\s()-]/g, "")
    .replace(/^\+?91(?=\d{10}$)/, "")
    .replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};
// "Ramesh Patidar" → "Ramesh P." for public lists.
export const displayName = (name: string): string => {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first || "";
};
export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000);
