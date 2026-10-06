import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalText, RequiredChoice, RequiredNumber, RequiredText } from "../../common/validation/fields.js";

export const PAYMENT_STATUSES = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"] as const;
export const TRANSACTION_TYPES = ["Family Registration", "Membership Payment", "Event Registration", "Donation", "Other"] as const;

export class CreateTransactionDto {
  @RequiredText("Transaction id is required.", 255)
  transactionId!: string;

  @RequiredChoice(TRANSACTION_TYPES, "Type is required.")
  type!: string;

  @RequiredNumber("Amount is required.")
  amount!: number;

  @OptionalText(255)
  paymentMethod?: string | null;

  @OptionalChoice(PAYMENT_STATUSES)
  paymentStatus?: string | null;

  @OptionalText(255)
  familyId?: string | null;

  @OptionalText(255)
  memberId?: string | null;

  @OptionalText(255)
  eventId?: string | null;

  @OptionalText(255)
  referenceId?: string | null;

  @OptionalDate()
  date?: string | null;

  @OptionalText()
  remarks?: string | null;
}

export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {}

export const TRANSACTION_ORDERS = orderValues([
  "id",
  "transactionId",
  "type",
  "amount",
  "paymentMethod",
  "paymentStatus",
  "familyId",
  "memberId",
  "eventId",
  "referenceId",
  "date",
  "remarks",
  "createdAt",
  "updatedAt",
] as const);

export class TransactionListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: TRANSACTION_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(TRANSACTION_ORDERS)
  order?: (typeof TRANSACTION_ORDERS)[number];
}
