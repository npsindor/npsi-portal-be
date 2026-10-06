import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export const DEFAULT_LIMIT = 100;

// `?limit=&offset=` of every list endpoint (page through with offset += limit);
// resources add `order` and their filters.
export class ListQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: "Rows to skip, for paging" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

// "-date" → [{ date: "desc" }, { id: "asc" }]: the id breaks ties so paging never skips or repeats rows.
export const toOrderBy = (order: string): Record<string, "asc" | "desc">[] => [
  order.startsWith("-") ? { [order.slice(1)]: "desc" } : { [order]: "asc" },
  { id: "asc" },
];

// The allowed `order` values for these fields, ascending and descending.
export const orderValues = <T extends string>(fields: readonly T[]): (T | `-${T}`)[] => fields.flatMap((field) => [field, `-${field}` as const]);
