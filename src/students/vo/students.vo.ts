import { ApiProperty } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { Student } from "../../generated/prisma/client.js";

export class StudentVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string", nullable: true }) studentId!: string | null;
  @ApiProperty({ type: "string" }) studentName!: string;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) mobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string", format: "date", nullable: true }) dob!: string | null;
  @ApiProperty({ type: "string", nullable: true }) gender!: string | null;
  @ApiProperty({ type: "string", nullable: true }) course!: string | null;
  @ApiProperty({ type: "string", nullable: true }) institution!: string | null;
  @ApiProperty({ type: "string", nullable: true }) academicYear!: string | null;
  @ApiProperty({ type: "string", nullable: true }) guardianName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) guardianMobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) address!: string | null;
  @ApiProperty({ type: "string", nullable: true }) city!: string | null;
  @ApiProperty({ type: "string", nullable: true }) district!: string | null;
  @ApiProperty({ type: "string", nullable: true }) state!: string | null;
  @ApiProperty({ type: "string", nullable: true }) pincode!: string | null;
  @ApiProperty({ type: "string", nullable: true }) photoUrl!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registrationDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) applicationId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) linkedFamilyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) linkedMembershipId!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
  @ApiProperty({ type: "string", nullable: true }) fatherName!: string | null;
}

export const toStudentVo = (row: Student): StudentVo => ({
  id: row.id,
  studentId: row.studentId,
  studentName: row.studentName,
  status: row.status,
  mobile: row.mobile,
  email: row.email,
  dob: toDateOnly(row.dob),
  gender: row.gender,
  course: row.course,
  institution: row.institution,
  academicYear: row.academicYear,
  guardianName: row.guardianName,
  guardianMobile: row.guardianMobile,
  address: row.address,
  city: row.city,
  district: row.district,
  state: row.state,
  pincode: row.pincode,
  photoUrl: row.photoUrl,
  registrationDate: row.registrationDate,
  applicationId: row.applicationId,
  linkedFamilyId: row.linkedFamilyId,
  linkedMembershipId: row.linkedMembershipId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  fatherName: row.fatherName,
});
