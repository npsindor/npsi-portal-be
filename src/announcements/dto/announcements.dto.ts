import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

export const ANNOUNCEMENT_STATUSES = ["Active", "Archived"] as const;
export const ANNOUNCEMENT_TYPES = ["General", "Event", "Urgent", "Festival"] as const;

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
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export const ANNOUNCEMENT_ORDERS = orderValues(["id", "title", "body", "date", "type", "status", "createdAt", "updatedAt", "titleHi", "bodyHi"] as const);

export class AnnouncementListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ANNOUNCEMENT_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(ANNOUNCEMENT_ORDERS)
  order?: (typeof ANNOUNCEMENT_ORDERS)[number];
}
