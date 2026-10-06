import { ApiProperty } from "@nestjs/swagger";
import type { Application } from "../../generated/prisma/client.js";

export class ApplicationVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) applicationId!: string;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string" }) familyHeadName!: string;
  @ApiProperty({ type: "string", nullable: true }) mobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string" }) familyName!: string;
  @ApiProperty({ type: "string", nullable: true }) address!: string | null;
  @ApiProperty({ type: "string", nullable: true }) city!: string | null;
  @ApiProperty({ type: "string", nullable: true }) district!: string | null;
  @ApiProperty({ type: "string", nullable: true }) state!: string | null;
  @ApiProperty({ type: "string", nullable: true }) pincode!: string | null;
  @ApiProperty({ type: "string", nullable: true }) gotra!: string | null;
  @ApiProperty({ type: "string", nullable: true }) nativePlace!: string | null;
  @ApiProperty({ type: "string", nullable: true }) village!: string | null;
  @ApiProperty({ nullable: true, oneOf: [{ type: "object" }, { type: "array", items: {} }] }) membersData!: unknown;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) submittedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) adminRemarks!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) reviewedDate!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) resultingFamilyId!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toApplicationVo = (row: Application): ApplicationVo => ({
  id: row.id,
  applicationId: row.applicationId,
  status: row.status,
  familyHeadName: row.familyHeadName,
  mobile: row.mobile,
  email: row.email,
  familyName: row.familyName,
  address: row.address,
  city: row.city,
  district: row.district,
  state: row.state,
  pincode: row.pincode,
  gotra: row.gotra,
  nativePlace: row.nativePlace,
  village: row.village,
  membersData: row.membersData,
  submittedDate: row.submittedDate,
  adminRemarks: row.adminRemarks,
  reviewedDate: row.reviewedDate,
  resultingFamilyId: row.resultingFamilyId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
