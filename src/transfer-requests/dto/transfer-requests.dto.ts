import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

export class CreateTransferRequestDto {
  @RequiredText("Request type is required.", 255)
  requestType!: string;

  @OptionalText(64, { notNull: true })
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
