import { ApiProperty } from "@nestjs/swagger";
import type { PageBlock } from "../../generated/prisma/client.js";
import { BLOCK_MEDIA_TYPES, BLOCK_PAGES, BLOCK_ROLES } from "../page-blocks.rules.js";

const text = { nullable: true, type: String };

export class PageBlockVo {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: BLOCK_PAGES }) page!: string;
  @ApiProperty() section!: string;
  @ApiProperty({ enum: BLOCK_ROLES }) role!: string;
  @ApiProperty(text) title!: string | null;
  @ApiProperty(text) titleHi!: string | null;
  @ApiProperty(text) subtitle!: string | null;
  @ApiProperty(text) subtitleHi!: string | null;
  @ApiProperty(text) body!: string | null;
  @ApiProperty(text) bodyHi!: string | null;
  @ApiProperty({ enum: BLOCK_MEDIA_TYPES }) mediaType!: string;
  @ApiProperty(text) mediaUrl!: string | null;
  @ApiProperty(text) linkUrl!: string | null;
  @ApiProperty(text) ctaLabel!: string | null;
  @ApiProperty(text) ctaLabelHi!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export const toPageBlockVo = (row: PageBlock): PageBlockVo => ({
  id: row.id,
  page: row.page,
  section: row.section,
  role: row.role,
  title: row.title,
  titleHi: row.titleHi,
  subtitle: row.subtitle,
  subtitleHi: row.subtitleHi,
  body: row.body,
  bodyHi: row.bodyHi,
  mediaType: row.mediaType,
  mediaUrl: row.mediaUrl,
  linkUrl: row.linkUrl,
  ctaLabel: row.ctaLabel,
  ctaLabelHi: row.ctaLabelHi,
  sortOrder: row.sortOrder,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
