import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { OptionalBoolean, OptionalChoice, OptionalDate, OptionalInt, OptionalText, RequiredChoice, RequiredText } from "../../common/validation/fields.js";
import { COMMUNITY_SECTIONS } from "../community-posts.rules.js";

export class CommunityPostListQueryDto {
  @ApiPropertyOptional({ enum: COMMUNITY_SECTIONS, description: "Only one section's posts" }) @IsOptional() @IsIn(COMMUNITY_SECTIONS) section?: string;
}

class CommunityPostFieldsDto {
  @OptionalText(200, { description: "Hindi title" }) titleHi?: string | null;
  @OptionalText(1500) body?: string | null;
  @OptionalText(1500) bodyHi?: string | null;
  @OptionalText(500, { description: "Our upload URL or https://" }) imageUrl?: string | null;
  @OptionalDate({ description: "Camp / drive / programme date (YYYY-MM-DD)" }) eventDate?: string | null;
  @OptionalText(200) location?: string | null;
  @OptionalText(200) locationHi?: string | null;
  @OptionalText(120) contactName?: string | null;
  @OptionalText(20, { description: "Phone or helpline (shown as a tap-to-call link)" }) contactPhone?: string | null;
  @OptionalText(500, { description: "Button link: a site path (/register) or https:// URL" }) linkUrl?: string | null;
  @OptionalText(80) ctaLabel?: string | null;
  @OptionalText(80) ctaLabelHi?: string | null;
  @OptionalBoolean({ notNull: true, description: "Shown first and larger in its section" }) featured?: boolean;
  @OptionalInt({ notNull: true }) sortOrder?: number;
  @OptionalBoolean({ notNull: true }) active?: boolean;
}

export class CreateCommunityPostDto extends CommunityPostFieldsDto {
  @RequiredChoice(COMMUNITY_SECTIONS, "Section is required.") section!: string;
  @RequiredText("Title is required.", 200) title!: string;
}

export class UpdateCommunityPostDto extends CommunityPostFieldsDto {
  @OptionalChoice(COMMUNITY_SECTIONS, { notNull: true }) section?: string;
  @OptionalText(200, { notNull: true }) title?: string;
}
