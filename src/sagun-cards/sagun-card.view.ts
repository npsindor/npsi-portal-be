import type { SagunDigitalCard, SagunProfile } from "../generated/prisma/client.js";
import { isoDate } from "../sagun/sagun.eligibility.js";
import type { SagunField } from "../sagun/sagun.fields.js";
import { ageOf, type ProfileData } from "../sagun/sagun.rules.js";

export type CardCategory = "GROOM" | "BRIDE";
export type CardState = "PENDING" | "APPROVED" | "REJECTED" | "INACTIVE";
export interface CardRow {
  key: "name" | "father" | "mobile" | "birth" | "height" | "education" | "occupation" | "place";
  label: string;
  value: string;
}
export interface CardView {
  profileId: string;
  cardId: string;
  profileCode: string;
  category: CardCategory;
  categoryLabel: string;
  name: string;
  rows: CardRow[];
  photoFileId: string | null;
  verifyUrl: string;
  state: CardState;
  profileStatus: string;
  // May go into an official booklet: approved, published to members with every consent, owner account active.
  bookletEligible: boolean;
  notEligibleReason: string | null;
  selected: boolean;
  lastPublishedAt: string | null;
  place: string;
  submittedAt: string | null;
  reviewNotes: string | null;
  contactConsent: boolean;
}

type ProfileWithCard = SagunProfile & { digitalCard: SagunDigitalCard; files: { id: string; kind: string }[]; user?: { status: string } | null };

const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : typeof value === "number" ? String(value) : "");
const optionLabel = (fields: SagunField[], key: string, value: string) =>
  fields.find((field) => field.key === key)?.options?.find((option) => option.value === value)?.hi || value;
const dateHi = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return `${day}-${month}-${year}`;
};
// 175 → "175 सेमी (5'9")"
export const heightText = (cm: number) => {
  const inches = Math.round(cm / 2.54);
  return `${cm} सेमी (${Math.floor(inches / 12)}'${inches % 12}")`;
};

export const cardStateOf = (status: string): CardState =>
  status === "APPROVED" ? "APPROVED" : status === "REJECTED" ? "REJECTED" : status === "INACTIVE" ? "INACTIVE" : "PENDING";

const PUBLISH_CONSENTS = ["candidateConsent", "displayConsent", "termsConsent", "matrimonialConsent", "accuracyConsent"];

// Why an approved profile can't go into a booklet (null when it can). Mirrors who may see a profile in the portal.
export const bookletBlocker = (profile: SagunProfile & { files: { kind: string }[] }, membersVisibility: boolean, ownerActive: boolean): string | null => {
  const data = profile.data as ProfileData;
  if (profile.status !== "APPROVED") return "NOT_APPROVED";
  if (!membersVisibility) return "PROFILES_HIDDEN";
  if (profile.visibility !== "MEMBERS") return "PRIVATE_PROFILE";
  if (!profile.memberId) return "NO_MEMBER";
  if (!ownerActive) return "OWNER_INACTIVE";
  if (PUBLISH_CONSENTS.some((key) => data[key] !== true)) return "CONSENT_MISSING";
  if (!profile.files.some((file) => file.kind === "PHOTO")) return "NO_PHOTO";
  return null;
};

// The card shows only what was submitted and may be printed: blank fields are left out, and the father's name,
// parent's mobile and full birth date only with the owner's "bookletContactConsent" (otherwise just the age).
export function buildCardView(profile: ProfileWithCard, fields: SagunField[], frontendUrl: string, membersVisibility: boolean, today: string): CardView {
  const data = profile.data as ProfileData;
  const category: CardCategory = profile.candidateType === "BRIDE" ? "BRIDE" : "GROOM";
  const consent = data.bookletContactConsent === true;
  const dob = text(data.dob) || (profile.birthDate ? (isoDate(profile.birthDate) as string) : "");
  const age = dob ? ageOf(dob, today) : null;
  const place = [text(data.nativeVillage), optionLabel(fields, "district", text(data.district))].filter(Boolean);
  const uniquePlace = place.filter((value, index) => place.indexOf(value) === index).join(", ");
  const height = Number(data.height);
  const mobile = text(data.fatherMobile).replace(/\D/g, "").slice(-10);
  const rows: CardRow[] = [
    { key: "name", label: category === "BRIDE" ? "युवती का नाम" : "युवक का नाम", value: text(data.fullName) || profile.displayName },
    { key: "father", label: "पिता का नाम", value: consent ? text(data.fatherName) : "" },
    { key: "mobile", label: "मोबाइल नंबर", value: consent && mobile.length === 10 ? `${mobile.slice(0, 5)} ${mobile.slice(5)}` : "" },
    {
      key: "birth",
      label: consent && dob ? "जन्मतिथि / आयु" : "आयु",
      value: age === null ? "" : consent && dob ? `${dateHi(dob)} (${age} वर्ष)` : `${age} वर्ष`,
    },
    { key: "height", label: "कद", value: Number.isFinite(height) && height > 0 ? heightText(height) : "" },
    { key: "education", label: "शैक्षणिक योग्यता", value: text(data.education) },
    { key: "occupation", label: "व्यवसाय / नौकरी", value: text(data.occupation) },
    { key: "place", label: "ग्राम / क्षेत्र", value: uniquePlace },
  ];
  const photo = profile.files.find((file) => file.kind === "PHOTO");
  const blocker = bookletBlocker(profile, membersVisibility, (profile.user?.status ?? "active") === "active");
  return {
    profileId: profile.id,
    cardId: profile.digitalCard.id,
    profileCode: profile.digitalCard.profileCode,
    category,
    categoryLabel: category === "BRIDE" ? "युवती" : "युवक",
    name: rows[0].value,
    rows: rows.filter((row) => row.value),
    photoFileId: photo?.id ?? null,
    verifyUrl: `${frontendUrl}/sagun/verify/${profile.digitalCard.verifyToken}`,
    state: cardStateOf(profile.status),
    profileStatus: profile.status,
    bookletEligible: blocker === null,
    notEligibleReason: blocker,
    selected: profile.digitalCard.selectedForBooklet && blocker === null,
    lastPublishedAt: profile.digitalCard.lastPublishedAt?.toISOString() ?? null,
    place: uniquePlace,
    submittedAt: profile.submittedAt?.toISOString() ?? null,
    reviewNotes: profile.reviewNotes,
    contactConsent: consent,
  };
}
