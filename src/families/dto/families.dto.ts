import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalText } from "../../common/validation/fields.js";

export const FAMILY_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;

export class CreateFamilyDto {
  @OptionalText()
  familyName?: string | null;

  @OptionalText()
  headName?: string | null;

  @OptionalChoice(FAMILY_STATUSES)
  status?: string | null;

  @OptionalText()
  address?: string | null;

  @OptionalText(255)
  city?: string | null;

  @OptionalText(255)
  district?: string | null;

  @OptionalText(255)
  state?: string | null;

  @OptionalText(255)
  pincode?: string | null;

  @OptionalText(255)
  nativePlace?: string | null;

  @OptionalText(255)
  village?: string | null;

  @OptionalText(255)
  gotra?: string | null;

  @OptionalText(255)
  contactNumber?: string | null;

  @OptionalText(255)
  email?: string | null;

  @OptionalDate()
  registrationDate?: string | null;

  @OptionalText(255)
  applicationId?: string | null;
}

export class UpdateFamilyDto extends PartialType(CreateFamilyDto) {}

export const FAMILY_ORDERS = orderValues([
  "id",
  "familyId",
  "familyName",
  "headName",
  "status",
  "address",
  "city",
  "district",
  "state",
  "pincode",
  "nativePlace",
  "village",
  "gotra",
  "contactNumber",
  "email",
  "registrationDate",
  "memberCount",
  "applicationId",
  "createdAt",
  "updatedAt",
] as const);

export class FamilyListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: FAMILY_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(FAMILY_ORDERS)
  order?: (typeof FAMILY_ORDERS)[number];

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  familyId?: string;

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  status?: string;
}
