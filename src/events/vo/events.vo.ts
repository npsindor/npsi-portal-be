import { ApiProperty } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { Event } from "../../generated/prisma/client.js";

export class EventVo {
  @ApiProperty({ type: "string" }) id!: string;
  @ApiProperty({ type: "string" }) title!: string;
  @ApiProperty({ type: "string", nullable: true }) slug!: string | null;
  @ApiProperty({ type: "string", nullable: true }) bannerUrl!: string | null;
  @ApiProperty({ type: "string", nullable: true }) description!: string | null;
  @ApiProperty({ type: "string", format: "date" }) date!: string;
  @ApiProperty({ type: "string", nullable: true }) startTime!: string | null;
  @ApiProperty({ type: "string", nullable: true }) endTime!: string | null;
  @ApiProperty({ type: "string" }) venue!: string;
  @ApiProperty({ type: "string", nullable: true }) mapLocation!: string | null;
  @ApiProperty({ type: "string", nullable: true }) organizer!: string | null;
  @ApiProperty({ type: "string", nullable: true }) contact!: string | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registrationOpen!: Date | null;
  @ApiProperty({ type: "string", format: "date-time", nullable: true }) registrationClose!: Date | null;
  @ApiProperty({ type: "number", nullable: true }) fee!: number | null;
  @ApiProperty({ type: "integer", nullable: true }) capacity!: number | null;
  @ApiProperty({ type: "string", nullable: true }) rules!: string | null;
  @ApiProperty({ type: "string", nullable: true }) terms!: string | null;
  @ApiProperty({ type: "string", nullable: true }) status!: string | null;
  @ApiProperty({ type: "string", format: "date-time" }) createdAt!: Date;
  @ApiProperty({ type: "string", format: "date-time" }) updatedAt!: Date;
  @ApiProperty({ type: "string", nullable: true }) titleHi!: string | null;
  @ApiProperty({ type: "string", nullable: true }) descriptionHi!: string | null;
}

export const toEventVo = (row: Event): EventVo => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  bannerUrl: row.bannerUrl,
  description: row.description,
  date: toDateOnly(row.date),
  startTime: row.startTime,
  endTime: row.endTime,
  venue: row.venue,
  mapLocation: row.mapLocation,
  organizer: row.organizer,
  contact: row.contact,
  registrationOpen: row.registrationOpen,
  registrationClose: row.registrationClose,
  fee: row.fee === null ? null : row.fee.toNumber(),
  capacity: row.capacity,
  rules: row.rules,
  terms: row.terms,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  titleHi: row.titleHi,
  descriptionHi: row.descriptionHi,
});
