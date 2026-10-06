import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalText, RequiredChoice } from "../../common/validation/fields.js";
import { LANGS, type Lang } from "../../notifications/notification-texts.js";

export const TRANSFER_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CORRECTION_REQUIRED"] as const;
export const TRANSFER_TYPES = ["student_to_family", "family_to_family"] as const;

export class CreateTransferRequestDto {
  @RequiredChoice(TRANSFER_TYPES, "Request type is required.")
  requestType!: string;

  @OptionalChoice(TRANSFER_STATUSES, { notNull: true })
  status?: string;

  @OptionalText()
  reason?: string | null;

  @OptionalText(255)
  sourceStudentId?: string | null;

  @OptionalText(255)
  sourceMembershipId?: string | null;

  @OptionalText(255)
  sourceFamilyId?: string | null;

  @OptionalText(255)
  targetFamilyId?: string | null;

  @OptionalText(255)
  requesterId?: string | null;

  @OptionalText()
  adminRemarks?: string | null;

  @OptionalText(255)
  approvedById?: string | null;

  @OptionalDate()
  approvedDate?: string | null;

  @OptionalText(255)
  resultingMembershipId?: string | null;

  @OptionalText(255)
  oldFamilyId?: string | null;

  @OptionalText(255)
  newFamilyId?: string | null;

  @OptionalText(255)
  requesterName?: string | null;

  @OptionalText(255)
  requesterEmail?: string | null;

  @OptionalText(255)
  requesterMobile?: string | null;

  @OptionalText()
  targetFamilyName?: string | null;

  @OptionalDate()
  requestedDate?: string | null;

  @ApiPropertyOptional({ enum: LANGS, default: "en", description: "Language of the notification sent to the target family" })
  @IsOptional()
  @IsIn(LANGS)
  lang?: Lang;
}

export class UpdateTransferRequestDto extends PartialType(CreateTransferRequestDto) {}

export const TRANSFERREQUEST_ORDERS = orderValues([
  "id",
  "requestId",
  "requestType",
  "status",
  "reason",
  "sourceStudentId",
  "sourceMembershipId",
  "sourceFamilyId",
  "targetFamilyId",
  "requesterId",
  "adminRemarks",
  "approvedById",
  "approvedDate",
  "resultingMembershipId",
  "oldFamilyId",
  "newFamilyId",
  "createdAt",
  "updatedAt",
  "requesterName",
  "requesterEmail",
  "requesterMobile",
  "targetFamilyName",
  "requestedDate",
] as const);

export class TransferRequestListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: TRANSFERREQUEST_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(TRANSFERREQUEST_ORDERS)
  order?: (typeof TRANSFERREQUEST_ORDERS)[number];
}
