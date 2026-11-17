import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional, type ApiPropertyOptions } from "@nestjs/swagger";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, isEmail, Matches, MaxLength, ValidateBy, ValidateIf } from "class-validator";

// Property decorators for request DTOs: Swagger docs, the lenient input
// conversions HTML forms need (numbers sent as text, "" for an empty optional
// field), and validation. Validators run in the order listed and stop at the
// first failure per field (global ValidationPipe `stopAtFirstError`).

const NOT_BLANK = /\S/;

const blankToNull = ({ value }: TransformFnParams): unknown => (typeof value === "string" && value.trim() === "" ? null : value);
const toText = ({ value }: TransformFnParams): unknown => (typeof value === "number" || typeof value === "boolean" ? String(value) : value);
const toNumber = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== "string") return value;
  if (value.trim() === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : value;
};
const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return value === "" ? null : value;
};

interface FieldOptions {
  description?: string;
  // The column has a default but can't be NULL: the field may be omitted, not nulled.
  notNull?: boolean;
}

// Optional: may be omitted; null clears it unless the column is NOT NULL.
const optional = (options: FieldOptions): PropertyDecorator => (options.notNull ? ValidateIf((_object, value) => value !== undefined) : IsOptional());
const docs = (schema: ApiPropertyOptions, options: FieldOptions, required = false): PropertyDecorator =>
  (required ? ApiProperty : ApiPropertyOptional)({ ...schema, ...(options.description ? { description: options.description } : {}) } as ApiPropertyOptions);

export const RequiredText = (message: string, max?: number, options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "string" }, options, true), Transform(toText), Matches(NOT_BLANK, { message }), ...(max ? [MaxLength(max)] : []));

export const OptionalText = (max?: number, options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(
    docs({ type: "string", nullable: !options.notNull }, options),
    Transform(toText),
    optional(options),
    IsString(),
    ...(max ? [MaxLength(max)] : []),
  );

export const EMAIL_ERROR = "Enter a valid email address.";
// Blank is allowed (no email); anything else must be a real address once trimmed. "name@gmail com" is refused:
// that account could never receive its password-reset or notification emails.
export const OptionalEmail = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(
    docs({ type: "string", format: "email", nullable: !options.notNull }, options),
    Transform(toText),
    optional(options),
    IsString(),
    MaxLength(255),
    ValidateBy({
      name: "isEmailOrBlank",
      validator: { validate: (value) => typeof value === "string" && (value.trim() === "" || isEmail(value.trim())), defaultMessage: () => EMAIL_ERROR },
    }),
  );

export const OptionalInt = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "integer", nullable: !options.notNull }, options), Transform(toNumber), optional(options), IsInt());

export const OptionalNumber = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "number", nullable: !options.notNull }, options), Transform(toNumber), optional(options), IsNumber());

export const RequiredNumber = (message: string, options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "number" }, options, true), Transform(toNumber), IsNumber({}, { message }));

export const OptionalBoolean = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "boolean", nullable: !options.notNull }, options), Transform(toBoolean), optional(options), IsBoolean());

// ISO 8601 date ("2026-01-31") or date-time; a date-time without a zone is UTC.
export const OptionalDate = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(
    docs({ type: "string", format: "date-time", nullable: !options.notNull }, options),
    Transform(blankToNull),
    optional(options),
    IsDateString(),
  );

// Today's date in India (YYYY-MM-DD); birth dates and "today" rules use the portal's own timezone.
export const indiaDate = (date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export const BIRTH_DATE_ERROR = "Date of birth must be a real date before today.";
// A birth date is a calendar date (YYYY-MM-DD) strictly before today: today and future dates are never valid.
export const isPastBirthDate = (value: unknown, today = indiaDate()): boolean => {
  const text = String(value ?? "").slice(0, 10);
  const date = new Date(`${text}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text && text < today && text >= "1900-01-01"
  );
};
export const OptionalBirthDate = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(
    docs({ type: "string", format: "date", nullable: !options.notNull, description: "YYYY-MM-DD, before today" }, options),
    Transform(blankToNull),
    optional(options),
    ValidateBy({ name: "isPastBirthDate", validator: { validate: (value) => isPastBirthDate(value), defaultMessage: () => BIRTH_DATE_ERROR } }),
  );

export const RequiredDate = (message: string, options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "string", format: "date-time" }, options, true), Transform(blankToNull), IsDateString({}, { message }));

// Any JSON value (object or array).
export const OptionalJson = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ oneOf: [{ type: "object" }, { type: "array", items: {} }], nullable: true }, options), IsOptional());

// One of a fixed list (statuses, types): anything else is a 400 naming the allowed values.
export const OptionalChoice = (values: readonly string[], options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "string", enum: [...values], nullable: !options.notNull }, options), Transform(blankToNull), optional(options), IsIn(values));

export const RequiredChoice = (values: readonly string[], message: string, options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "string", enum: [...values] }, options, true), Matches(NOT_BLANK, { message }), IsIn(values));
