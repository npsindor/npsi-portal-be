import { ApiProperty } from "@nestjs/swagger";
import { toRecord } from "../../../common/utils/records.js";
import type { DbRow } from "../../../database/database.service.js";
import { swaggerType } from "../dto/entity.dto.js";
import { ENTITY_DEFINITIONS, ENTITY_NAMES, type EntityName } from "../entity-definitions.js";

// One response VO per entity: its columns plus id and the renamed timestamps.
// `toEntityVo` is the only way a DB row leaves the API (timestamps renamed,
// JSON strings parsed), exactly like the legacy `toRecord`.

export type EntityVo = Record<string, unknown> & { id: string };

const createEntityVo = (name: EntityName): (new () => EntityVo) => {
  const vo = class {};
  Object.defineProperty(vo, "name", { value: `${name}Vo` });
  ApiProperty({ type: "string" })(vo.prototype, "id");
  for (const [column, kind] of Object.entries(ENTITY_DEFINITIONS[name].columns)) ApiProperty({ ...swaggerType(kind), nullable: true })(vo.prototype, column);
  ApiProperty({ type: "string", format: "date-time" })(vo.prototype, "created_date");
  ApiProperty({ type: "string", format: "date-time" })(vo.prototype, "updated_date");
  return vo as new () => EntityVo;
};

export const ENTITY_VOS = Object.fromEntries(ENTITY_NAMES.map((name) => [name, createEntityVo(name)])) as Record<EntityName, new () => EntityVo>;

export const toEntityVo = (row: DbRow): EntityVo => toRecord(row) as EntityVo;
