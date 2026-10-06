import { ApiProperty } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { FamilyMember } from "../../generated/prisma/client.js";

export class FamilyMemberVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) familyId!: string;
  @ApiProperty({ type: "string", nullable: true }) membershipId!: string | null;
  @ApiProperty({ type: "string" }) name!: string;
  @ApiProperty({ type: "string" }) relationship!: string;
  @ApiProperty({ type: "string", nullable: true }) gender!: string | null;
  @ApiProperty({ type: "string", format: "date", nullable: true }) dob!: string | null;
  @ApiProperty({ type: "string", nullable: true }) mobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string", nullable: true }) education!: string | null;
  @ApiProperty({ type: "string", nullable: true }) occupation!: string | null;
  @ApiProperty({ type: "string", nullable: true }) address!: string | null;
  @ApiProperty({ type: "string", nullable: true }) photoUrl!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) linkedStudentId!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toFamilyMemberVo = (row: FamilyMember): FamilyMemberVo => ({
  id: row.id,
  familyId: row.familyId,
  membershipId: row.membershipId,
  name: row.name,
  relationship: row.relationship,
  gender: row.gender,
  dob: toDateOnly(row.dob),
  mobile: row.mobile,
  email: row.email,
  education: row.education,
  occupation: row.occupation,
  address: row.address,
  photoUrl: row.photoUrl,
  status: row.status,
  linkedStudentId: row.linkedStudentId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
