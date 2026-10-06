import { ApiProperty } from "@nestjs/swagger";
import type { Family } from "../../generated/prisma/client.js";

export class FamilyVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string", nullable: true }) familyId!: string | null;
  @ApiProperty({ type: "string", nullable: true }) familyName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) headName!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", nullable: true }) address!: string | null;
  @ApiProperty({ type: "string", nullable: true }) city!: string | null;
  @ApiProperty({ type: "string", nullable: true }) district!: string | null;
  @ApiProperty({ type: "string", nullable: true }) state!: string | null;
  @ApiProperty({ type: "string", nullable: true }) pincode!: string | null;
  @ApiProperty({ type: "string", nullable: true }) nativePlace!: string | null;
  @ApiProperty({ type: "string", nullable: true }) village!: string | null;
  @ApiProperty({ type: "string", nullable: true }) gotra!: string | null;
  @ApiProperty({ type: "string", nullable: true }) contactNumber!: string | null;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registrationDate!: Date | null;
  @ApiProperty({ type: "integer", nullable: true }) memberCount!: number | null;
  @ApiProperty({ type: "string", nullable: true }) applicationId!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toFamilyVo = (row: Family): FamilyVo => ({
  id: row.id,
  familyId: row.familyId,
  familyName: row.familyName,
  headName: row.headName,
  status: row.status,
  address: row.address,
  city: row.city,
  district: row.district,
  state: row.state,
  pincode: row.pincode,
  nativePlace: row.nativePlace,
  village: row.village,
  gotra: row.gotra,
  contactNumber: row.contactNumber,
  email: row.email,
  registrationDate: row.registrationDate,
  memberCount: row.memberCount,
  applicationId: row.applicationId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
