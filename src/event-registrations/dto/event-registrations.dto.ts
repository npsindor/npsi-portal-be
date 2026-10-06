import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalInt, OptionalJson, OptionalNumber, OptionalText, RequiredText } from "../../common/validation/fields.js";

export class CreateEventRegistrationDto {
  @RequiredText("Registration id is required.", 255)
  registrationId!: string;

  @RequiredText("Event id is required.", 64)
  eventId!: string;

  @OptionalText(255)
  eventTitle?: string | null;

  @OptionalText(255)
  familyId?: string | null;

  @OptionalJson()
  memberIds?: unknown | null;

  @OptionalJson()
  memberNames?: unknown | null;

  @OptionalInt()
  count?: number | null;

  @OptionalNumber()
  feePerMember?: number | null;

  @OptionalNumber()
  totalFee?: number | null;

  @OptionalText(64)
  paymentStatus?: string | null;

  @OptionalText(255)
  transactionId?: string | null;

  @OptionalText(64)
  status?: string | null;

  @OptionalText(255)
  registeredById?: string | null;

  @OptionalDate()
  registeredDate?: string | null;

  @OptionalText(255)
  registrantName?: string | null;

  @OptionalText(255)
  registrantEmail?: string | null;
}

export class UpdateEventRegistrationDto extends PartialType(CreateEventRegistrationDto) {}

export const EVENTREGISTRATION_ORDERS = orderValues([
  "id",
  "registrationId",
  "eventId",
  "eventTitle",
  "familyId",
  "count",
  "feePerMember",
  "totalFee",
  "paymentStatus",
  "transactionId",
  "status",
  "registeredById",
  "registeredDate",
  "registrantName",
  "registrantEmail",
  "createdAt",
  "updatedAt",
] as const);

export class EventRegistrationListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: EVENTREGISTRATION_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(EVENTREGISTRATION_ORDERS)
  order?: (typeof EVENTREGISTRATION_ORDERS)[number];
}
