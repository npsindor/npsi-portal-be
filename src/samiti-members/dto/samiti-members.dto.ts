import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalText, RequiredText } from "../../common/validation/fields.js";

export const SAMITI_MEMBER_STATUSES = ["Active", "Inactive"] as const;

export class CreateSamitiMemberDto {
  @RequiredText("Samiti id is required.", 64)
  samitiId!: string;

  @RequiredText("Name is required.")
  name!: string;

  @OptionalText(255)
  position?: string | null;

  @OptionalText(255)
  mobile?: string | null;

  @OptionalText(255)
  email?: string | null;

  @OptionalChoice(SAMITI_MEMBER_STATUSES)
  status?: string | null;
}

export class UpdateSamitiMemberDto extends PartialType(CreateSamitiMemberDto) {}

export const SAMITIMEMBER_ORDERS = orderValues(["id", "samitiId", "name", "position", "mobile", "email", "status", "createdAt", "updatedAt"] as const);

export class SamitiMemberListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: SAMITIMEMBER_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(SAMITIMEMBER_ORDERS)
  order?: (typeof SAMITIMEMBER_ORDERS)[number];

  @ApiPropertyOptional({ description: "Exact match" })
  @IsOptional()
  @IsString()
  samitiId?: string;
}
