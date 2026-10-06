import { applyDecorators } from "@nestjs/common";
import { ApiProperty, ApiPropertyOptional, type ApiPropertyOptions } from "@nestjs/swagger";
import { Transform, type TransformFnParams } from "class-transformer";
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateIf } from "class-validator";

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

export const RequiredDate = (message: string, options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ type: "string", format: "date-time" }, options, true), Transform(blankToNull), IsDateString({}, { message }));

// Any JSON value (object or array).
export const OptionalJson = (options: FieldOptions = {}): PropertyDecorator =>
  applyDecorators(docs({ oneOf: [{ type: "object" }, { type: "array", items: {} }], nullable: true }, options), IsOptional());
