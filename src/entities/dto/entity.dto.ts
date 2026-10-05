import { ApiProperty, ApiPropertyOptional, type ApiPropertyOptions } from "@nestjs/swagger";
import { IsOptional } from "class-validator";
import { type ColumnKind, ENTITY_DEFINITIONS, ENTITY_NAMES, type EntityName } from "../entity-definitions.js";

// One request DTO per entity, generated from its column list. Every field is
// optional: the entity service enforces the legacy rules (required fields,
// ownership, field whitelists) with the legacy messages. The global
// ValidationPipe's whitelist drops anything that isn't a real column.

export type EntityBody = Record<string, unknown>;
type Ctor<T = object> = new () => T;

export const swaggerType = (kind: ColumnKind): ApiPropertyOptions => {
  switch (kind) {
    case "i":
      return { type: "integer" };
    case "d":
      return { type: "number", description: "Decimal (returned as a string)" };
    case "b":
      return { type: "boolean", description: "Returned as 0/1" };
    case "j":
      return { type: "object", additionalProperties: true, description: "JSON value (object or array)" };
    case "dt":
      return { type: "string", format: "date-time" };
    case "dd":
      return { type: "string", format: "date" };
    default:
      return { type: "string" };
  }
};

const camelCase = (column: string): string => column.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

const namedClass = (name: string): Ctor => {
  const ctor = class {};
  Object.defineProperty(ctor, "name", { value: name });
  return ctor;
};

const optional = (target: object, key: string, options: ApiPropertyOptions | null): void => {
  IsOptional()(target, key);
  if (options) ApiPropertyOptional(options)(target, key);
};

// Fields accepted by an entity's create/update endpoints (besides its columns).
const EXTRA_FIELDS: Partial<Record<EntityName, Record<string, ApiPropertyOptions>>> = {
  Application: { recaptchaToken: { type: "string", description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" } },
  StudentApplication: { recaptchaToken: { type: "string", description: "Google reCAPTCHA v3 token (required when the server has a secret configured)" } },
};

const createEntityDto = (name: EntityName): Ctor<EntityBody> => {
  const dto = namedClass(`${name}Dto`);
  const { columns } = ENTITY_DEFINITIONS[name];
  // A client-supplied `id` is honored on create (existing behavior), so it stays accepted.
  optional(dto.prototype, "id", { type: "string", description: "Optional record id (generated when omitted)" });
  for (const [column, kind] of Object.entries(columns)) {
    optional(dto.prototype, column, swaggerType(kind));
    // camelCase spellings map to the same column (legacy toColumn rule); accepted, not documented.
    const alias = camelCase(column);
    if (alias !== column) optional(dto.prototype, alias, null);
  }
  for (const [field, options] of Object.entries(EXTRA_FIELDS[name] ?? {})) optional(dto.prototype, field, options);
  return dto as Ctor<EntityBody>;
};

const createBatchDto = (name: EntityName, itemDto: Ctor): Ctor<{ records?: EntityBody[] }> => {
  const dto = namedClass(`${name}BatchDto`);
  IsOptional()(dto.prototype, "records");
  ApiProperty({ type: itemDto, isArray: true, description: "Records to create; ids are assigned in order" })(dto.prototype, "records");
  return dto as Ctor<{ records?: EntityBody[] }>;
};

export const ENTITY_DTOS = Object.fromEntries(ENTITY_NAMES.map((name) => [name, createEntityDto(name)])) as Record<EntityName, Ctor<EntityBody>>;
export const ENTITY_BATCH_DTOS = Object.fromEntries(ENTITY_NAMES.map((name) => [name, createBatchDto(name, ENTITY_DTOS[name])])) as Record<
  EntityName,
  Ctor<{ records?: EntityBody[] }>
>;

// Field names an entity accepts, for whitelisting batch items the same way.
export const acceptedFields = (name: EntityName): Set<string> => {
  const columns = Object.keys(ENTITY_DEFINITIONS[name].columns);
  return new Set(["id", ...columns, ...columns.map(camelCase), ...Object.keys(EXTRA_FIELDS[name] ?? {})]);
};

export class ListQueryDto {
  @ApiPropertyOptional({ description: 'JSON object of exact-match filters, e.g. {"status":"ACTIVE"}', example: '{"status":"ACTIVE"}' })
  @IsOptional()
  filter?: string;

  @ApiPropertyOptional({ description: "Sort field; prefix with - for descending", default: "-createdAt", example: "-createdAt" })
  @IsOptional()
  order?: string;

  @ApiPropertyOptional({ description: "Max records (1–500)", default: 100, example: 100 })
  @IsOptional()
  limit?: string;
}
