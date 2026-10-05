import { ApiProperty, getSchemaPath } from "@nestjs/swagger";
import type { EntityVo } from "../../entities/vo/entity.vo.js";
import { ENTITY_VOS } from "../../entities/vo/entity.vo.js";

export class MyFamilyVo {
  @ApiProperty({
    nullable: true,
    allOf: [{ $ref: getSchemaPath(ENTITY_VOS.Family) }],
    description: "The member's ACTIVE family (by email), or the family they are listed in",
  })
  family: EntityVo | null;

  @ApiProperty({ type: "array", items: { $ref: getSchemaPath(ENTITY_VOS.FamilyMember) }, description: "Members of that family, oldest first" })
  members: EntityVo[];

  @ApiProperty({ nullable: true, allOf: [{ $ref: getSchemaPath(ENTITY_VOS.Student) }], description: "The member's own student record, if any" })
  student: EntityVo | null;
}
