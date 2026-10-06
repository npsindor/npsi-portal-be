import { ApiProperty } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { Samiti } from "../../generated/prisma/client.js";

export class SamitiVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) name!: string;
  @ApiProperty({ type: "string", nullable: true }) description!: string | null;
  @ApiProperty({ type: "string", format: "date", nullable: true }) formedDate!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toSamitiVo = (row: Samiti): SamitiVo => ({
  id: row.id,
  name: row.name,
  description: row.description,
  formedDate: toDateOnly(row.formedDate),
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
