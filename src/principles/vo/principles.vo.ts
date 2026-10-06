import { ApiProperty } from "@nestjs/swagger";
import type { Principle } from "../../generated/prisma/client.js";

export class PrincipleVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "integer", nullable: true }) sectionNumber!: number | null;
  @ApiProperty({ type: "string" }) titleEn!: string;
  @ApiProperty({ type: "string" }) titleHi!: string;
  @ApiProperty({ type: "string" }) contentEn!: string;
  @ApiProperty({ type: "string" }) contentHi!: string;
  @ApiProperty({ type: "string" }) status!: string;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
}

export const toPrincipleVo = (row: Principle): PrincipleVo => ({
  id: row.id,
  sectionNumber: row.sectionNumber,
  titleEn: row.titleEn,
  titleHi: row.titleHi,
  contentEn: row.contentEn,
  contentHi: row.contentHi,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});
