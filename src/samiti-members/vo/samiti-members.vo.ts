import { ApiProperty } from "@nestjs/swagger";
import type { SamitiMember } from "../../generated/prisma/client.js";

export class SamitiMemberVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) samitiId!: string;
  @ApiProperty({ type: "string" }) name!: string;
  @ApiProperty({ type: "string", nullable: true }) position!: string | null;
  @ApiProperty({ type: "string", nullable: true }) mobile!: string | null;
  @ApiProperty({ type: "string", nullable: true }) email!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toSamitiMemberVo = (row: SamitiMember): SamitiMemberVo => ({
  id: row.id,
  samitiId: row.samitiId,
  name: row.name,
  position: row.position,
  mobile: row.mobile,
  email: row.email,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
