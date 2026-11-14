import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { OptionalBoolean, OptionalChoice, OptionalDate, OptionalInt, OptionalText, RequiredChoice, RequiredText } from "../../common/validation/fields.js";
import { HIGHLIGHT_MEDIA_TYPES, HIGHLIGHT_SLIDERS } from "../home-highlights.rules.js";

export class HomeHighlightListQueryDto {
  @ApiPropertyOptional({ enum: HIGHLIGHT_SLIDERS, description: "Only one slider's slides" }) @IsOptional() @IsIn(HIGHLIGHT_SLIDERS) slider?: string;
}

class HomeHighlightFieldsDto {
  @OptionalChoice(HIGHLIGHT_MEDIA_TYPES, { notNull: true, description: "Media slider only: IMAGE, VIDEO (YouTube or .mp4/.webm link) or TEXT" })
  mediaType?: string;
  @OptionalBoolean({ notNull: true, description: "Sponsored / advertisement: shown with an 'Ad' label" }) sponsored?: boolean;
  @OptionalText(80) eyebrow?: string | null;
  @OptionalText(80) eyebrowHi?: string | null;
  @OptionalText(200, { description: "Hindi title" }) titleHi?: string | null;
  @OptionalText(600) body?: string | null;
  @OptionalText(600) bodyHi?: string | null;
  @OptionalText(500, { description: "Image (our upload URL or https://) or video link" }) mediaUrl?: string | null;
  @OptionalText(500, { description: "Button link: a site path (/events) or https:// URL" }) linkUrl?: string | null;
  @OptionalText(80) ctaLabel?: string | null;
  @OptionalText(80) ctaLabelHi?: string | null;
  @OptionalDate({ description: "First day shown (YYYY-MM-DD)" }) startDate?: string | null;
  @OptionalDate({ description: "Last day shown (YYYY-MM-DD)" }) endDate?: string | null;
  @OptionalInt({ notNull: true }) sortOrder?: number;
  @OptionalBoolean({ notNull: true }) active?: boolean;
}

export class CreateHomeHighlightDto extends HomeHighlightFieldsDto {
  @RequiredChoice(HIGHLIGHT_SLIDERS, "Slider is required.") slider!: string;
  @RequiredText("Title is required.", 200) title!: string;
}

export class UpdateHomeHighlightDto extends HomeHighlightFieldsDto {
  @OptionalText(200, { notNull: true }) title?: string;
}
