import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalInt, OptionalJson, OptionalNumber, OptionalText, RequiredText } from "../../common/validation/fields.js";
import { LANGS, type Lang } from "../../notifications/notification-texts.js";

export const EVENT_REGISTRATION_STATUSES = ["REGISTERED", "ATTENDED", "CANCELLED"] as const;
export const PAYMENT_STATUSES = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"] as const;

// The registration id (EVT-REG-…) is assigned by the server.
export class CreateEventRegistrationDto {
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

  @OptionalChoice(PAYMENT_STATUSES)
  paymentStatus?: string | null;

  @OptionalText(255)
  transactionId?: string | null;

  @OptionalChoice(EVENT_REGISTRATION_STATUSES)
  status?: string | null;

  @OptionalText(255)
  registeredById?: string | null;

  @OptionalDate()
  registeredDate?: string | null;

  @OptionalText(255)
  registrantName?: string | null;

  @OptionalText(255)
  registrantEmail?: string | null;

  @ApiPropertyOptional({ enum: LANGS, default: "en", description: "Language of the confirmation notification" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
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
