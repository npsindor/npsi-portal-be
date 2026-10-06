import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalInt, OptionalNumber, OptionalText, RequiredDate, RequiredText } from "../../common/validation/fields.js";

export class CreateEventDto {
  @RequiredText("Title is required.")
  title!: string;

  @OptionalText(255)
  slug?: string | null;

  @OptionalText()
  bannerUrl?: string | null;

  @OptionalText()
  description?: string | null;

  @RequiredDate("Date is required.")
  date!: string;

  @OptionalText(255)
  startTime?: string | null;

  @OptionalText(255)
  endTime?: string | null;

  @RequiredText("Venue is required.")
  venue!: string;

  @OptionalText()
  mapLocation?: string | null;

  @OptionalText(255)
  organizer?: string | null;

  @OptionalText(255)
  contact?: string | null;

  @OptionalDate()
  registrationOpen?: string | null;

  @OptionalDate()
  registrationClose?: string | null;

  @OptionalNumber()
  fee?: number | null;

  @OptionalInt()
  capacity?: number | null;

  @OptionalText()
  rules?: string | null;

  @OptionalText()
  terms?: string | null;

  @OptionalText(64)
  status?: string | null;

  @OptionalText()
  titleHi?: string | null;

  @OptionalText()
  descriptionHi?: string | null;
}

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export const EVENT_ORDERS = orderValues([
  "id",
  "title",
  "slug",
  "bannerUrl",
  "description",
  "date",
  "startTime",
  "endTime",
  "venue",
  "mapLocation",
  "organizer",
  "contact",
  "registrationOpen",
  "registrationClose",
  "fee",
  "capacity",
  "rules",
  "terms",
  "status",
  "createdAt",
  "updatedAt",
  "titleHi",
  "descriptionHi",
] as const);

export class EventListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EVENT_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(EVENT_ORDERS)
  order?: (typeof EVENT_ORDERS)[number];
}
