// Blood Help Network rules: blood groups, who can give to whom, when a donor may be suggested again, and the two
// request states. Final medical eligibility is always for the blood bank or doctor to confirm.

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

// Only two request states: still looking for blood, or the blood was received (confirmed by the requester or
// verified by an administrator).
export const REQUEST_STATUSES = ["IN_PROGRESS", "COMPLETED"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const COMPLETION_SOURCES = ["REQUESTER", "ADMIN"] as const;

export const MAX_UNITS = 10;
// Whole-blood donations are at least 90 days apart (NBTC guideline); donors who gave more recently aren't suggested.
export const DEFAULT_DONATION_GAP_DAYS = 90;
// The requester is asked "Did you receive the blood?" once a request is this old, and again this often after a "No".
export const CONFIRM_AFTER_DAYS = 2;
export const CONFIRM_AGAIN_DAYS = 3;

// Red cell compatibility: the donor groups a patient of each group can receive.
export const COMPATIBLE_DONORS: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-"],
  "O+": ["O+", "O-"],
  "A-": ["A-", "O-"],
  "A+": ["A+", "A-", "O+", "O-"],
  "B-": ["B-", "O-"],
  "B+": ["B+", "B-", "O+", "O-"],
  "AB-": ["AB-", "A-", "B-", "O-"],
  "AB+": ["AB+", "AB-", "A+", "A-", "B+", "B-", "O+", "O-"],
};
export const compatibleDonors = (patient: string): BloodGroup[] => COMPATIBLE_DONORS[patient as BloodGroup] ?? [];

const DAY = 24 * 60 * 60 * 1000;
export const daysBetween = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / DAY);

// A donor may be suggested when they are available and their last donation (if any) is at least `gapDays` ago.
export const donorEligible = (donor: { available: boolean; lastDonationDate: Date | null }, now: Date, gapDays = DEFAULT_DONATION_GAP_DAYS): boolean =>
  donor.available && (!donor.lastDonationDate || daysBetween(donor.lastDonationDate, now) >= gapDays);

// The day a donor may donate again (null: no donation recorded).
export const nextEligibleDate = (last: Date | null, gapDays = DEFAULT_DONATION_GAP_DAYS): Date | null =>
  last ? new Date(last.getTime() + gapDays * DAY) : null;

// Whether the requester should be asked if the blood was received.
export const needsConfirmation = (request: { status: string; createdAt: Date; lastPromptedAt: Date | null }, now: Date): boolean =>
  request.status === "IN_PROGRESS" &&
  daysBetween(request.createdAt, now) >= CONFIRM_AFTER_DAYS &&
  (!request.lastPromptedAt || daysBetween(request.lastPromptedAt, now) >= CONFIRM_AGAIN_DAYS);

// Indian mobile numbers: the last 10 digits, starting 6–9.
export const mobile10 = (value: string | null | undefined): string | null => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(-10);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

// A WhatsApp chat link for an Indian mobile, with a ready message.
export const whatsappLink = (mobile: string | null, text: string): string | null => {
  const number = mobile10(mobile);
  return number ? `https://wa.me/91${number}?text=${encodeURIComponent(text)}` : null;
};

export interface HistoryEntry {
  at: string;
  status: RequestStatus;
  source: "REQUESTER" | "ADMIN" | "CREATED" | "NOTIFIED";
  byId: string;
  note?: string;
  // NOTIFIED: the donors this request was sent to (each donor is sent a request once).
  donorIds?: string[];
}
// A member may have this many requests in progress at once; it also limits collecting donor contacts with requests.
export const MAX_OPEN_REQUESTS = 3;
export const notifiedDonors = (history: unknown): Set<string> =>
  new Set(historyOf(history).flatMap((entry) => (entry.source === "NOTIFIED" ? (entry.donorIds ?? []) : [])));
export const historyOf = (value: unknown): HistoryEntry[] => (Array.isArray(value) ? (value as HistoryEntry[]) : []);
