import { ApiProperty } from "@nestjs/swagger";
import type { Announcement } from "../../generated/prisma/client.js";

export class AnnouncementVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) title!: string;
  @ApiProperty({ type: "string" }) body!: string;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) date!: Date | null;
  @ApiProperty({ type: "string", nullable: true }) type!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
  @ApiProperty({ type: "string", nullable: true }) titleHi!: string | null;
  @ApiProperty({ type: "string", nullable: true }) bodyHi!: string | null;
  @ApiProperty({ type: "string", nullable: true }) category!: string | null;
  @ApiProperty({ type: "string", nullable: true }) imageUrl!: string | null;
  @ApiProperty({ type: "string", nullable: true }) slug!: string | null;
  @ApiProperty({ type: "string", nullable: true }) author!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) publishAt!: Date | null;
}

export const toAnnouncementVo = (row: Announcement): AnnouncementVo => ({
  id: row.id,
  title: row.title,
  body: row.body,
  date: row.date,
  type: row.type,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  titleHi: row.titleHi,
  bodyHi: row.bodyHi,
  category: row.category,
  imageUrl: row.imageUrl,
  slug: row.slug,
  author: row.author,
  publishAt: row.publishAt,
});
