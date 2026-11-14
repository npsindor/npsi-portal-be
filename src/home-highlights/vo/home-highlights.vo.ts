import { ApiProperty } from "@nestjs/swagger";
import { toDateOnly } from "../../common/utils/dates.js";
import type { HomeHighlight } from "../../generated/prisma/client.js";
import { HIGHLIGHT_MEDIA_TYPES, HIGHLIGHT_SLIDERS } from "../home-highlights.rules.js";

const text = { nullable: true, type: String };

export class HomeHighlightVo {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: HIGHLIGHT_SLIDERS }) slider!: string;
  @ApiProperty({ enum: HIGHLIGHT_MEDIA_TYPES }) mediaType!: string;
  @ApiProperty() sponsored!: boolean;
  @ApiProperty(text) eyebrow!: string | null;
  @ApiProperty(text) eyebrowHi!: string | null;
  @ApiProperty() title!: string;
  @ApiProperty(text) titleHi!: string | null;
  @ApiProperty(text) body!: string | null;
  @ApiProperty(text) bodyHi!: string | null;
  @ApiProperty(text) mediaUrl!: string | null;
  @ApiProperty(text) linkUrl!: string | null;
  @ApiProperty(text) ctaLabel!: string | null;
  @ApiProperty(text) ctaLabelHi!: string | null;
  @ApiProperty({ ...text, format: "date" }) startDate!: string | null;
  @ApiProperty({ ...text, format: "date" }) endDate!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export const toHomeHighlightVo = (row: HomeHighlight): HomeHighlightVo => ({
  id: row.id,
  slider: row.slider,
  mediaType: row.mediaType,
  sponsored: row.sponsored,
  eyebrow: row.eyebrow,
  eyebrowHi: row.eyebrowHi,
  title: row.title,
  titleHi: row.titleHi,
  body: row.body,
  bodyHi: row.bodyHi,
  mediaUrl: row.mediaUrl,
  linkUrl: row.linkUrl,
  ctaLabel: row.ctaLabel,
  ctaLabelHi: row.ctaLabelHi,
  startDate: toDateOnly(row.startDate),
  endDate: toDateOnly(row.endDate),
  sortOrder: row.sortOrder,
  active: row.active,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
