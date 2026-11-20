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

// A transfer request the member filed that an admin hasn't decided yet (PENDING / CORRECTION_REQUIRED): lets the portal
// show "transfer pending" on the member and not offer a second request.
export class MyOpenTransferRequestVo {
  @ApiProperty({ example: "TRF-000012" }) requestId!: string;
  @ApiProperty({ example: "family_to_family" }) requestType!: string;
  @ApiProperty({ example: "PENDING" }) status!: string;
  @ApiProperty({ example: "NPSI-MEM-000034", nullable: true }) sourceMembershipId!: string | null;
  @ApiProperty({ example: "NPSI-STU-000003", nullable: true }) sourceStudentId!: string | null;
  @ApiProperty({ example: "NPSI-FAM-000002", nullable: true }) targetFamilyId!: string | null;
  @ApiProperty({ example: "2026-11-18T10:00:00.000Z" }) createdAt!: string;
}
