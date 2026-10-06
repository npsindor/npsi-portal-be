import { ApiProperty } from "@nestjs/swagger";
import { FamilyVo } from "../../families/vo/families.vo.js";
import { FamilyMemberVo } from "../../family-members/vo/family-members.vo.js";
import { ApplicationVo } from "./applications.vo.js";

export class ApplicationReviewVo {
  @ApiProperty({ type: ApplicationVo }) application!: ApplicationVo;
  @ApiProperty({ type: FamilyVo, nullable: true, description: "The family created on approval" }) family!: FamilyVo | null;
  @ApiProperty({ type: FamilyMemberVo, isArray: true, description: "Its members, created from the application" }) members!: FamilyMemberVo[];
}
