// Same lists as the frontend (src/lib/member-options.js): a son or daughter may be in any class (LKG onwards); an adult
// relative (the head, spouse, father, mother, brother, sister, sister-in-law, daughter-in-law, younger brother's wife) starts from 8th.
const ordinal = (n: number): string => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
export const BELOW_8TH = ["LKG", "UKG", ...Array.from({ length: 7 }, (_, i) => ordinal(i + 1))];
export const ADULT_EDUCATION_RELATIONSHIPS = [
  "head",
  "self",
  "spouse",
  "father",
  "mother",
  "brother",
  "sister",
  "sister-in-law",
  "daughter-in-law",
  "younger brother's wife",
];
export const EDUCATION_FROM_8TH =
  "For a spouse, father, mother, brother, sister, sister-in-law, daughter-in-law, younger brother's wife or the head, education starts from 8th.";

export const educationNotAllowed = (relationship: string | null | undefined, education: string | null | undefined): boolean =>
  BELOW_8TH.includes(String(education ?? "").trim()) &&
  ADULT_EDUCATION_RELATIONSHIPS.includes(
    String(relationship ?? "")
      .trim()
      .toLowerCase(),
  );
