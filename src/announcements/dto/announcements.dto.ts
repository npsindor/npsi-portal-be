import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

// Draft: being written; Active: published (from publishAt, if set); Archived: unpublished.
export const ANNOUNCEMENT_STATUSES = ["Draft", "Active", "Archived"] as const;
export const ANNOUNCEMENT_CATEGORIES = ["ORGANIZATION", "COMMUNITY", "SOCIAL", "EDUCATION", "EVENTS", "IMPORTANT", "PUBLIC_NOTICE"] as const;
// Sandesh page sections: Notice / Urgent / General → Important Notices, News / Event → Community News, Festival → Festival Greetings.
export const ANNOUNCEMENT_TYPES = ["Notice", "News", "Festival", "General", "Event", "Urgent"] as const;

export class CreateAnnouncementDto {
  @RequiredText("Title is required.")
  title!: string;

  @RequiredText("Body is required.")
  body!: string;

  @OptionalDate()
  date?: string | null;

  @OptionalChoice(ANNOUNCEMENT_TYPES)
  type?: string | null;

  @OptionalChoice(ANNOUNCEMENT_STATUSES)
  status?: string | null;

  @OptionalText()
  titleHi?: string | null;

  @OptionalText()
  bodyHi?: string | null;

  @OptionalChoice(ANNOUNCEMENT_CATEGORIES)
  category?: string | null;

  @OptionalText(500, { description: "Featured image: a URL returned by POST /uploads" })
  imageUrl?: string | null;

  @OptionalDate({ description: "Scheduled publication; Active items are public only from this time" })
  publishAt?: string | null;
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export const ANNOUNCEMENT_ORDERS = orderValues([
  "id",
  "title",
  "body",
  "date",
  "type",
  "status",
  "createdAt",
  "updatedAt",
  "titleHi",
  "bodyHi",
  "category",
  "publishAt",
] as const);

export class AnnouncementListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ANNOUNCEMENT_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_ORDERS, { message: "Invalid sort field." })
  order?: (typeof ANNOUNCEMENT_ORDERS)[number];

  @ApiPropertyOptional({ enum: ANNOUNCEMENT_CATEGORIES })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category?: string;
}
