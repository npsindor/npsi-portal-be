import { ApiProperty } from "@nestjs/swagger";
import { FamilyVo } from "../../families/vo/families.vo.js";
import { FamilyMemberVo } from "../../family-members/vo/family-members.vo.js";
import { StudentVo } from "../../students/vo/students.vo.js";

export class MyFamilyVo {
  @ApiProperty({ type: FamilyVo, nullable: true, description: "The member's ACTIVE family (by email), or the family they are listed in" })
  family!: FamilyVo | null;

  @ApiProperty({ type: FamilyMemberVo, isArray: true, description: "Members of that family, oldest first" })
  members!: FamilyMemberVo[];

  @ApiProperty({ type: StudentVo, nullable: true, description: "The member's own student record, if any" })
  student!: StudentVo | null;
}
