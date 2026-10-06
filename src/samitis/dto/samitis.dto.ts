import { ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { ListQueryDto, orderValues } from "../../common/dto/list-query.dto.js";
import { OptionalChoice, OptionalDate, OptionalText, RequiredText } from "../../common/validation/fields.js";

export const SAMITI_STATUSES = ["Active", "Inactive"] as const;

export class CreateSamitiDto {
  @RequiredText("Name is required.")
  name!: string;

  @OptionalText()
  description?: string | null;

  @OptionalDate()
  formedDate?: string | null;

  @OptionalChoice(SAMITI_STATUSES)
  status?: string | null;
}

export class UpdateSamitiDto extends PartialType(CreateSamitiDto) {}

export const SAMITI_ORDERS = orderValues(["id", "name", "description", "formedDate", "status", "createdAt", "updatedAt"] as const);

export class SamitiListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: SAMITI_ORDERS, default: "-createdAt" })
  @IsOptional()
  @IsIn(SAMITI_ORDERS)
  order?: (typeof SAMITI_ORDERS)[number];
}
