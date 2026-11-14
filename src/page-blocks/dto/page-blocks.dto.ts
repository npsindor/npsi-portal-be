import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, Matches, MaxLength } from "class-validator";
import { OptionalBoolean, OptionalChoice, OptionalInt, OptionalText, RequiredChoice, RequiredText } from "../../common/validation/fields.js";
import { BLOCK_MEDIA_TYPES, BLOCK_PAGES, BLOCK_ROLES, SECTION_KEY } from "../page-blocks.rules.js";

export class PageBlockListQueryDto {
  @ApiPropertyOptional({ enum: BLOCK_PAGES, description: "One page's blocks" }) @IsOptional() @IsIn(BLOCK_PAGES) page?: string;
}

class PageBlockFieldsDto {
  @OptionalChoice(BLOCK_ROLES, { notNull: true, description: "INTRO overrides the section heading/text/media; ITEM adds an entry (default)" }) role?: string;
  @OptionalText(200) title?: string | null;
  @OptionalText(200) titleHi?: string | null;
  @OptionalText(200, { description: "Small line under the title: designation, company, location…" }) subtitle?: string | null;
  @OptionalText(200) subtitleHi?: string | null;
  @OptionalText(8000) body?: string | null;
  @OptionalText(8000) bodyHi?: string | null;
  @OptionalChoice(BLOCK_MEDIA_TYPES, { notNull: true }) mediaType?: string;
  @OptionalText(500, { description: "Image (our upload URL or https://) or video (YouTube / .mp4)" }) mediaUrl?: string | null;
  @OptionalText(500, { description: "Button link: a site path (/register) or https:// URL" }) linkUrl?: string | null;
  @OptionalText(80) ctaLabel?: string | null;
  @OptionalText(80) ctaLabelHi?: string | null;
  @OptionalInt({ notNull: true }) sortOrder?: number;
  @OptionalBoolean({ notNull: true }) active?: boolean;
}

export class CreatePageBlockDto extends PageBlockFieldsDto {
  @RequiredChoice(BLOCK_PAGES, "Page is required.") page!: string;
  @RequiredText("Section is required.", 40)
  @Matches(SECTION_KEY, { message: "Section must be a lowercase key like objectives or job-opportunities." })
  section!: string;
}

export class UpdatePageBlockDto extends PageBlockFieldsDto {
  @IsOptional() @MaxLength(40) @Matches(SECTION_KEY, { message: "Section must be a lowercase key like objectives or job-opportunities." }) section?: string;
}
