import { ApiError } from "../common/filters/api-error.js";
import { indiaToday } from "../safar-saathi/safar.rules.js";
import { type SagunField, sagunFields } from "./sagun.fields.js";
export type ProfileData = Record<string, string | number | boolean | Record<string, string | number>[]>;
export const ageOf = (dob: string, today = indiaToday()): number => {
  const [y, m, d] = dob.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
};
export const validDate = (value: string): boolean => {
  const d = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
// The file's own bytes decide its type. The browser's declared type and the file name are not trusted either way:
// phones send "image/jpg" or "application/octet-stream", Windows saves JPEGs as ".jfif", and some apps drop the
// extension, so rejecting those turned away genuine photographs. The stored file gets a server-chosen extension.
export const sagunUploadMime = (buffer: Buffer, kind: string, _declaredMime?: string, _filename?: string): string | null => {
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  const pdf = buffer.subarray(0, 5).toString() === "%PDF-";
  return png ? "image/png" : jpg ? "image/jpeg" : webp ? "image/webp" : pdf && kind !== "PHOTO" ? "application/pdf" : null;
};
// A PDF that carries actions or scripts (run by readers such as Acrobat when the file is opened) is refused: an
// identity document needs none of them. Names written as #xx hex escapes (/J#61vaScript) are decoded first.
const ACTIVE_PDF_NAMES = /\/(?:JavaScript|JS|OpenAction|AA|Launch|SubmitForm|ImportData|RichMedia|EmbeddedFile|GoToR|GoToE|XFA)\b/;
export const pdfHasActiveContent = (buffer: Buffer): boolean => {
  const text = buffer.toString("latin1").replace(/#([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  return ACTIVE_PDF_NAMES.test(text);
};
export const effectiveFields = (overrides: unknown): SagunField[] =>
  sagunFields
    .filter((field) => field.section !== "sagun" && !field.removed)
    .map((field) => {
      const entry = Array.isArray(overrides) ? overrides.find((value) => value?.key === field.key) : null;
      return entry
        ? {
            ...field,
            en: entry.en || field.en,
            hi: entry.hi || field.hi,
            enabled: field.locked ? true : (entry.enabled ?? true),
            required:
              field.locked || field.optionalOnly || ["sagun", "documents"].includes(field.section) ? field.required : (entry.required ?? field.required),
          }
        : field;
    });
export const sanitizeData = (raw: Record<string, unknown>, fields: SagunField[], submit: boolean): ProfileData => {
  const result: ProfileData = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "SAGUN_INVALID_DATA");
  for (const key of Object.keys(raw)) if (!sagunFields.some((field) => field.key === key)) throw new ApiError(400, "SAGUN_UNKNOWN_FIELD");
  for (const field of fields) {
    const value = raw[field.key];
    const blank = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (submit && field.enabled && field.required && (blank || (field.type === "checkbox" && value !== true)))
      throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    if (blank) continue;
    if (field.type === "items") {
      if (!Array.isArray(value) || value.length > 100) throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
      const items = value
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(400, "SAGUN_ITEMS");
          const clean: Record<string, string | number> = {};
          for (const [key, v] of Object.entries(item)) {
            if (
              ![
                "name",
                "quantity",
                "value",
                "offeredBy",
                "ceremony",
                "notes",
                "donorName",
                "donorRelationship",
                "recipient",
                "givenOn",
                "recordStatus",
              ].includes(key) ||
              !["string", "number"].includes(typeof v)
            )
              throw new ApiError(400, "SAGUN_ITEMS");
            if (String(v).length > 1000) throw new ApiError(400, "SAGUN_ITEMS");
            if (key === "value" && v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 1e9)) throw new ApiError(400, "SAGUN_ITEMS");
            if (key === "offeredBy" && v !== "" && !["GROOM_FAMILY", "BRIDE_FAMILY", "OTHER"].includes(String(v))) throw new ApiError(400, "SAGUN_ITEMS");
            if (key === "recipient" && v !== "" && !["BRIDE", "GROOM"].includes(String(v))) throw new ApiError(400, "SAGUN_ITEMS");
            if (key === "recordStatus" && v !== "" && !["PLANNED", "GIVEN"].includes(String(v))) throw new ApiError(400, "SAGUN_ITEMS");
            if (key === "givenOn" && v !== "" && !validDate(String(v))) throw new ApiError(400, "SAGUN_ITEMS");
            clean[key] = key === "value" && v !== "" ? Number(v) : String(v).trim();
          }
          return clean;
        })
        .filter((item) => Object.values(item).some((value) => value !== ""));
      if (items.some((item) => !item.name)) throw new ApiError(400, "SAGUN_ITEMS");
      result[field.key] = items;
      continue;
    }
    if (field.type === "checkbox") {
      if (typeof value !== "boolean") throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
      result[field.key] = value;
      continue;
    }
    if (field.type === "number") {
      if (
        !["number", "string"].includes(typeof value) ||
        !Number.isFinite(Number(value)) ||
        (field.min !== undefined && Number(value) < field.min) ||
        (field.max !== undefined && Number(value) > field.max)
      )
        throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
      if (
        ["brothers", "sisters", "marriedBrothers", "marriedSisters", "preferredAgeMin", "preferredAgeMax"].includes(field.key) &&
        !Number.isInteger(Number(value))
      )
        throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
      result[field.key] = Number(value);
      continue;
    }
    if (typeof value !== "string" || value.length > (field.type === "textarea" ? 1500 : field.type === "email" ? 254 : 200))
      throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    const text = value.trim();
    if (field.type === "select" && !field.options?.some((option) => option.value === text)) throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    if (field.type === "tel" && !/^[6-9]\d{9}$/.test(text)) throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    if (field.type === "date" && !validDate(text)) throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new ApiError(400, `SAGUN_FIELD:${field.key}`);
    if (field.key === "pincode" && !/^[1-9]\d{5}$/.test(text)) throw new ApiError(400, "SAGUN_FIELD:pincode");
    result[field.key] = text;
  }
  if (result.dob && result.candidateType && (ageOf(String(result.dob)) < (result.candidateType === "GROOM" ? 21 : 18) || String(result.dob) > indiaToday()))
    throw new ApiError(400, "SAGUN_ELIGIBILITY");
  if (result.marriedBrothers !== undefined && result.brothers !== undefined && Number(result.marriedBrothers) > Number(result.brothers))
    throw new ApiError(400, "SAGUN_SIBLINGS");
  if (result.marriedSisters !== undefined && result.sisters !== undefined && Number(result.marriedSisters) > Number(result.sisters))
    throw new ApiError(400, "SAGUN_SIBLINGS");
  if (result.preferredAgeMin !== undefined && result.preferredAgeMax !== undefined && Number(result.preferredAgeMin) > Number(result.preferredAgeMax))
    throw new ApiError(400, "SAGUN_AGE_RANGE");
  const hasSagun = fields.some(
    (field) =>
      field.section === "sagun" &&
      field.key !== "voluntaryConsent" &&
      result[field.key] !== undefined &&
      result[field.key] !== "" &&
      (!Array.isArray(result[field.key]) || (result[field.key] as unknown[]).length > 0),
  );
  if (hasSagun && result.voluntaryConsent !== true) throw new ApiError(400, "SAGUN_VOLUNTARY");
  return result;
};
export const publicKeys = [
  "fullName",
  "candidateType",
  "height",
  "bloodGroup",
  "gotra",
  "community",
  "maritalStatus",
  "education",
  "college",
  "occupation",
  "company",
  "professionalDetails",
  "fatherGotra",
  "mamaGotra",
  "brothers",
  "sisters",
  "marriedBrothers",
  "marriedSisters",
  "familyType",
  "familyBackground",
  "nativeVillage",
  "preferredAgeMin",
  "preferredAgeMax",
  "preferredHeight",
  "preferredEducation",
  "preferredProfession",
  "preferredLocation",
  "preferredMaritalStatus",
  "otherExpectations",
  "city",
  "district",
  "state",
];
export const contactKeys = ["candidateMobile", "fatherMobile", "motherMobile", "email", "fatherName", "motherName"];
export const pick = (data: ProfileData, keys: string[]) => Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
export const fileKinds: Record<string, string> = { PHOTO: "photoFileId", KUNDLI: "kundliFileId", IDENTITY: "identityFileId", SUPPORT: "supportFileId" };
