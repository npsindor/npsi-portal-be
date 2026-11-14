import { ApiProperty } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { CommunityPost } from "../../generated/prisma/client.js";
import { COMMUNITY_SECTIONS } from "../community-posts.rules.js";

const text = { nullable: true, type: String };

export class CommunityPostVo {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: COMMUNITY_SECTIONS }) section!: string;
  @ApiProperty() title!: string;
  @ApiProperty(text) titleHi!: string | null;
  @ApiProperty(text) body!: string | null;
  @ApiProperty(text) bodyHi!: string | null;
  @ApiProperty(text) imageUrl!: string | null;
  @ApiProperty({ ...text, format: "date" }) eventDate!: string | null;
  @ApiProperty(text) location!: string | null;
  @ApiProperty(text) locationHi!: string | null;
  @ApiProperty(text) contactName!: string | null;
  @ApiProperty(text) contactPhone!: string | null;
  @ApiProperty(text) linkUrl!: string | null;
  @ApiProperty(text) ctaLabel!: string | null;
  @ApiProperty(text) ctaLabelHi!: string | null;
  @ApiProperty() featured!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export const toCommunityPostVo = (row: CommunityPost): CommunityPostVo => ({
  id: row.id,
  section: row.section,
  title: row.title,
  titleHi: row.titleHi,
  body: row.body,
  bodyHi: row.bodyHi,
  imageUrl: row.imageUrl,
  eventDate: toDateOnly(row.eventDate),
  location: row.location,
  locationHi: row.locationHi,
  contactName: row.contactName,
  contactPhone: row.contactPhone,
  linkUrl: row.linkUrl,
  ctaLabel: row.ctaLabel,
  ctaLabelHi: row.ctaLabelHi,
  featured: row.featured,
  sortOrder: row.sortOrder,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
